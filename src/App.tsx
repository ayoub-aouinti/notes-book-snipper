import { useEffect, useMemo, useState } from 'react'
import pdfMake from 'pdfmake/build/pdfmake'
import pdfFonts from 'pdfmake/build/vfs_fonts'
import { AlignmentType, Document, HeadingLevel, Packer, Paragraph, TextRun } from 'docx'
import './App.css'
import { supabase } from './supabase'

type Note = {
  id: string
  title: string
  topic: string
  text: string
  sourceImage?: string
  createdAt: string
}

type OcrStatus = 'idle' | 'loading' | 'success' | 'error'

;(pdfMake as unknown as { vfs: Record<string, string> }).vfs = pdfFonts.vfs

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [sourceImage, setSourceImage] = useState<string | undefined>(undefined)
  const [sourceImageFile, setSourceImageFile] = useState<File | null>(null)
  const [filter, setFilter] = useState('الكل')
  const [draftId, setDraftId] = useState<string | null>(null)
  const [ocrStatus, setOcrStatus] = useState<OcrStatus>('idle')
  const [ocrError, setOcrError] = useState<string | null>(null)
  const [syncError, setSyncError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [loadingNotes, setLoadingNotes] = useState(false)

  const [authLoading, setAuthLoading] = useState(true)
  const [authUserName, setAuthUserName] = useState<string | null>(null)
  const [authUserEmail, setAuthUserEmail] = useState<string | null>(null)
  const [authUserAvatar, setAuthUserAvatar] = useState<string | null>(null)
  const [authUserId, setAuthUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [isRegisterMode, setIsRegisterMode] = useState(false)
  const [authError, setAuthError] = useState<string | null>(null)

  const ocrApiKey = import.meta.env.VITE_GOOGLE_VISION_API_KEY as string | undefined
  const ocrProxyUrl = import.meta.env.VITE_OCR_PROXY_URL as string | undefined

  useEffect(() => {
    if (!supabase) {
      setAuthLoading(false)
      return
    }

    let active = true
    const loadSession = async () => {
      const { data } = await supabase.auth.getSession()
      if (!active) return
      const user = data.session?.user ?? null
      setAuthUserName((user?.user_metadata?.full_name as string) || user?.email || null)
      setAuthUserEmail(user?.email ?? null)
      setAuthUserAvatar((user?.user_metadata?.avatar_url as string) || null)
      setAuthUserId(user?.id ?? null)
      setAuthLoading(false)
    }

    loadSession()

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      const user = session?.user ?? null
      setAuthUserName((user?.user_metadata?.full_name as string) || user?.email || null)
      setAuthUserEmail(user?.email ?? null)
      setAuthUserAvatar((user?.user_metadata?.avatar_url as string) || null)
      setAuthUserId(user?.id ?? null)
      setAuthLoading(false)
    })

    return () => {
      active = false
      subscription.subscription.unsubscribe()
    }
  }, [])

  useEffect(() => {
    const loadNotes = async () => {
      if (!supabase || !authUserId) return
      setLoadingNotes(true)
      setSyncError(null)
      const { data, error } = await supabase
        .from('notes')
        .select('id,title,topic,text,source_image,created_at')
        .eq('user_id', authUserId)
        .order('created_at', { ascending: false })
      if (error) {
        setSyncError('تعذر تحميل الفوائد من قاعدة البيانات.')
        setLoadingNotes(false)
        return
      }
      const mapped = (data || []).map((item) => ({
        id: String(item.id),
        title: item.title ?? '',
        topic: item.topic ?? '',
        text: item.text ?? '',
        sourceImage: item.source_image ?? undefined,
        createdAt: item.created_at ?? new Date().toISOString(),
      }))
      setNotes(mapped)
      setLoadingNotes(false)
    }

    loadNotes()
  }, [authUserId])

  const topics = useMemo(() => {
    const unique = new Set(notes.map((n) => n.topic).filter(Boolean))
    return Array.from(unique)
  }, [notes])

  const filteredNotes = useMemo(() => {
    if (filter === 'الكل') return notes
    return notes.filter((note) => note.topic === filter)
  }, [notes, filter])

  const canSave = text.trim().length > 0

  const handleImagePick = (file?: File | null) => {
    if (!file) return
    setSourceImage(file.name)
    setSourceImageFile(file)
    setOcrStatus('idle')
    setOcrError(null)
    if (!text.trim()) {
      setText('نسخة أولية من النص بعد OCR. يمكنك تصحيحها هنا...')
    }
  }

  const resetDraft = () => {
    setTitle('')
    setTopic('')
    setText('')
    setSourceImage(undefined)
    setSourceImageFile(null)
    setDraftId(null)
    setOcrStatus('idle')
    setOcrError(null)
    setSyncError(null)
  }

  const saveNote = async () => {
    if (!canSave || !supabase || !authUserId) return
    setSaving(true)
    setSyncError(null)
    const now = new Date().toISOString()
    const payload = {
      title: title.trim() || 'مقتطف بلا عنوان',
      topic: topic.trim() || 'غير مصنف',
      text: text.trim(),
      source_image: sourceImage ?? null,
      created_at: now,
      user_id: authUserId,
    }

    if (draftId) {
      const { error } = await supabase.from('notes').update(payload).eq('id', draftId)
      if (error) {
        setSyncError('تعذر تحديث الفائدة.')
        setSaving(false)
        return
      }
      setNotes((prev) =>
        prev.map((note) =>
          note.id === draftId
            ? {
                ...note,
                title: payload.title,
                topic: payload.topic,
                text: payload.text,
                sourceImage: payload.source_image ?? undefined,
                createdAt: now,
              }
            : note
        )
      )
    } else {
      const { data, error } = await supabase.from('notes').insert(payload).select('id')
      if (error) {
        setSyncError('تعذر حفظ الفائدة.')
        setSaving(false)
        return
      }
      const newId = data?.[0]?.id ? String(data[0].id) : crypto.randomUUID()
      const note: Note = {
        id: newId,
        title: payload.title,
        topic: payload.topic,
        text: payload.text,
        sourceImage: payload.source_image ?? undefined,
        createdAt: now,
      }
      setNotes((prev) => [note, ...prev])
    }

    setSaving(false)
    resetDraft()
  }

  const loadNote = (note: Note) => {
    setDraftId(note.id)
    setTitle(note.title)
    setTopic(note.topic)
    setText(note.text)
    setSourceImage(note.sourceImage)
  }

  const deleteNote = async (id: string) => {
    if (!supabase) return
    setSyncError(null)
    const { error } = await supabase.from('notes').delete().eq('id', id)
    if (error) {
      setSyncError('تعذر حذف الفائدة.')
      return
    }
    setNotes((prev) => prev.filter((note) => note.id !== id))
  }

  const download = (name: string, content: string, type: string) => {
    const blob = new Blob([content], { type })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const downloadBlob = (name: string, blob: Blob) => {
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = name
    a.click()
    URL.revokeObjectURL(url)
  }

  const groupNotes = () =>
    notes.reduce<Record<string, Note[]>>((acc, note) => {
      const key = note.topic || 'غير مصنف'
      acc[key] = acc[key] ? [...acc[key], note] : [note]
      return acc
    }, {})

  const exportTxt = () => {
    const grouped = groupNotes()
    const blocks = Object.entries(grouped)
      .map(([group, items]) => {
        const lines = items
          .map(
            (note, index) =>
              `${index + 1}. ${note.title}\n${note.text}\n(${note.createdAt})`
          )
          .join('\n\n')
        return `${group}\n${'-'.repeat(24)}\n${lines}`
      })
      .join('\n\n')
    download('notes.txt', blocks || 'لا توجد فوائد بعد.', 'text/plain;charset=utf-8')
  }

  const exportCsv = () => {
    const header = 'title,topic,text,createdAt\n'
    const rows = notes
      .map((note) =>
        [note.title, note.topic, note.text, note.createdAt]
          .map((value) => `"${value.replace(/"/g, '""')}"`)
          .join(',')
      )
      .join('\n')
    download('notes.csv', header + rows, 'text/csv;charset=utf-8')
  }

  const exportJson = () => {
    download('notes.json', JSON.stringify(notes, null, 2), 'application/json')
  }

  const exportPdf = () => {
    const grouped = groupNotes()
    const content = Object.entries(grouped).flatMap(([group, items]) => {
      const block = [
        { text: group, style: 'topic' },
        ...items.flatMap((note) => [
          { text: note.title, style: 'title' },
          { text: note.text, style: 'body' },
          { text: new Date(note.createdAt).toLocaleString('ar'), style: 'meta' },
          { text: ' ', margin: [0, 0, 0, 6] },
        ]),
      ]
      return block
    })

    const docDefinition = {
      content: content.length ? content : [{ text: 'لا توجد فوائد بعد.' }],
      defaultStyle: { alignment: 'right' },
      styles: {
        topic: { fontSize: 16, bold: true, margin: [0, 0, 0, 6] },
        title: { fontSize: 13, bold: true, margin: [0, 0, 0, 4] },
        body: { fontSize: 12, margin: [0, 0, 0, 4] },
        meta: { fontSize: 9, color: '#6c6153', margin: [0, 0, 0, 10] },
      },
      pageMargins: [40, 40, 40, 40],
    }

    pdfMake.createPdf(docDefinition).download('notes.pdf')
  }

  const exportDocx = async () => {
    const grouped = groupNotes()
    const children: Paragraph[] = []

    if (Object.keys(grouped).length === 0) {
      children.push(
        new Paragraph({
          text: 'لا توجد فوائد بعد.',
          alignment: AlignmentType.RIGHT,
          rightToLeft: true,
        })
      )
    } else {
      Object.entries(grouped).forEach(([group, items]) => {
        children.push(
          new Paragraph({
            text: group,
            heading: HeadingLevel.HEADING_1,
            alignment: AlignmentType.RIGHT,
            rightToLeft: true,
          })
        )
        items.forEach((note) => {
          children.push(
            new Paragraph({
              text: note.title,
              heading: HeadingLevel.HEADING_2,
              alignment: AlignmentType.RIGHT,
              rightToLeft: true,
            })
          )
          children.push(
            new Paragraph({
              children: [
                new TextRun({ text: note.text, break: 1 }),
                new TextRun({
                  text: new Date(note.createdAt).toLocaleString('ar'),
                  break: 1,
                }),
              ],
              alignment: AlignmentType.RIGHT,
              rightToLeft: true,
            })
          )
        })
      })
    }

    const doc = new Document({
      sections: [
        {
          properties: { rightToLeft: true },
          children,
        },
      ],
    })

    const blob = await Packer.toBlob(doc)
    downloadBlob('notes.docx', blob)
  }

  const fileToBase64 = (file: File) =>
    new Promise<string>((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const result = reader.result as string
        const base64 = result.split(',')[1]
        if (!base64) reject(new Error('تعذر قراءة الصورة'))
        resolve(base64)
      }
      reader.onerror = () => reject(new Error('تعذر قراءة الصورة'))
      reader.readAsDataURL(file)
    })

  const runOcr = async () => {
    if (!sourceImageFile) return
    setOcrStatus('loading')
    setOcrError(null)

    try {
      const base64 = await fileToBase64(sourceImageFile)
      let textResult = ''

      if (ocrProxyUrl) {
        const response = await fetch(ocrProxyUrl, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ imageBase64: base64, languageHint: 'ar' }),
        })
        const payload = await response.json()
        textResult = payload.text || ''
      } else {
        if (!ocrApiKey) {
          throw new Error('أضف مفتاح Google Vision في متغير البيئة VITE_GOOGLE_VISION_API_KEY')
        }
        const response = await fetch(
          `https://vision.googleapis.com/v1/images:annotate?key=${ocrApiKey}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              requests: [
                {
                  image: { content: base64 },
                  features: [{ type: 'DOCUMENT_TEXT_DETECTION' }],
                  imageContext: { languageHints: ['ar'] },
                },
              ],
            }),
          }
        )

        const payload = await response.json()
        textResult =
          payload?.responses?.[0]?.fullTextAnnotation?.text ||
          payload?.responses?.[0]?.textAnnotations?.[0]?.description ||
          ''
      }

      if (!textResult.trim()) {
        throw new Error('لم يتم العثور على نص واضح في الصورة')
      }

      setText(textResult.trim())
      setOcrStatus('success')
    } catch (error) {
      const message = error instanceof Error ? error.message : 'حدث خطأ أثناء OCR'
      setOcrError(message)
      setOcrStatus('error')
    }
  }

  const loginWithProvider = async (provider: 'google' | 'facebook') => {
    if (!supabase) return
    setAuthError(null)
    const { error } = await supabase.auth.signInWithOAuth({
      provider,
      options: { redirectTo: window.location.origin },
    })
    if (error) setAuthError(error.message)
  }

  const loginWithPassword = async () => {
    if (!supabase) return
    setAuthError(null)
    if (!email.trim() || !password.trim()) {
      setAuthError('أدخل البريد الإلكتروني وكلمة المرور.')
      return
    }
    const { error } = await supabase.auth.signInWithPassword({
      email: email.trim(),
      password: password.trim(),
    })
    if (error) setAuthError(error.message)
  }

  const registerWithPassword = async () => {
    if (!supabase) return
    setAuthError(null)
    if (!email.trim() || !password.trim()) {
      setAuthError('أدخل البريد الإلكتروني وكلمة المرور.')
      return
    }
    const { error } = await supabase.auth.signUp({
      email: email.trim(),
      password: password.trim(),
      options: { emailRedirectTo: window.location.origin },
    })
    if (error) setAuthError(error.message)
  }

  const logout = async () => {
    if (!supabase) return
    await supabase.auth.signOut()
  }

  const isAuthenticated = Boolean(authUserEmail)

  return (
    <div className="app" dir="rtl" lang="ar">
      {!isAuthenticated ? (
        <main className="auth-screen">
          <section className="auth-card">
            <p className="eyebrow">دفتر الفوائد من الكتب</p>
            <h1>سجل الدخول لبدء حفظ فوائدك</h1>
            <p className="lead">
              بعد تسجيل الدخول ستتمكن من إضافة الفوائد وتصنيفها وتصديرها.
            </p>
            <div className="auth">
              <span className="label">تسجيل الدخول</span>
              {authLoading ? (
                <p className="hint">جاري الاتصال بخدمة التوثيق...</p>
              ) : (
                <>
                  <div className="actions">
                    <button
                      className="btn btn-outline"
                      type="button"
                      onClick={() => loginWithProvider('google')}
                    >
                      Sign in with Google
                    </button>
                  </div>

                  <div className="auth-divider">أو</div>

                  <div className="auth-form">
                    <label className="field">
                      <span>البريد الإلكتروني</span>
                      <input
                        className="input"
                        type="email"
                        value={email}
                        onChange={(event) => setEmail(event.target.value)}
                        placeholder="example@email.com"
                      />
                    </label>
                    <label className="field">
                      <span>كلمة المرور</span>
                      <input
                        className="input"
                        type="password"
                        value={password}
                        onChange={(event) => setPassword(event.target.value)}
                        placeholder="••••••••"
                      />
                    </label>
                    <div className="actions">
                      {isRegisterMode ? (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={registerWithPassword}
                        >
                          إنشاء حساب
                        </button>
                      ) : (
                        <button
                          className="btn btn-primary"
                          type="button"
                          onClick={loginWithPassword}
                        >
                          تسجيل الدخول
                        </button>
                      )}
                      <button
                        className="btn btn-ghost"
                        type="button"
                        onClick={() => setIsRegisterMode((prev) => !prev)}
                      >
                        {isRegisterMode ? 'لديك حساب؟ تسجيل الدخول' : 'مستخدم جديد؟ إنشاء حساب'}
                      </button>
                    </div>
                  </div>
                </>
              )}
              {authError && <div className="error">{authError}</div>}
              {!supabase && (
                <p className="hint warn">
                  أضف VITE_SUPABASE_URL و VITE_SUPABASE_ANON_KEY لتفعيل التوثيق.
                </p>
              )}
            </div>
          </section>
        </main>
      ) : (
        <>
          <header className="hero">
            <div>
              <p className="eyebrow">دفتر الفوائد من الكتب</p>
              <h1>اجمع فوائدك بسرعة ورتّبها حسب الموضوع</h1>
              <p className="lead">
                التقط صورة، حرر النص، أضف عنوانا وموضوعا، ثم احفظ كل فائدة في
                مكان واحد.
              </p>
            </div>
            <div className="auth">
              <span className="label">حسابك</span>
              <div className="auth-user">
                {authUserAvatar && (
                  <img className="avatar" src={authUserAvatar} alt="user" />
                )}
                <div>
                  <div className="user-name">{authUserName || 'مستخدم'}</div>
                  <div className="hint">{authUserEmail}</div>
                </div>
                <button className="btn btn-ghost" onClick={logout}>
                  تسجيل الخروج
                </button>
              </div>
            </div>
          </header>

        <main className="grid">
        <section className="panel">
          <div className="section-title">1) التقاط المقطع</div>
          <p className="muted">
            افتح الكاميرا أو ارفع صورة لمقطع من كتاب، ثم ابدأ عملية استخراج
            النص.
          </p>
          <div className="actions">
            <label className="btn btn-primary">
              فتح الكاميرا
              <input
                type="file"
                accept="image/*"
                capture="environment"
                onChange={(event) => handleImagePick(event.target.files?.[0])}
                hidden
              />
            </label>
            <label className="btn btn-ghost">
              رفع صورة
              <input
                type="file"
                accept="image/*"
                onChange={(event) => handleImagePick(event.target.files?.[0])}
                hidden
              />
            </label>
            <button
              className="btn btn-outline"
              type="button"
              onClick={runOcr}
              disabled={!sourceImageFile || ocrStatus === 'loading'}
            >
              {ocrStatus === 'loading' ? 'جاري الاستخراج...' : 'استخراج النص عبر OCR'}
            </button>
          </div>
          {sourceImage && <div className="pill">آخر ملف: {sourceImage}</div>}
          {ocrError && <div className="error">{ocrError}</div>}
          {ocrStatus === 'success' && <div className="success">تم استخراج النص بنجاح.</div>}
          {!ocrProxyUrl && !ocrApiKey && (
            <p className="hint warn">
              يفضّل تمرير OCR عبر سيرفر لحماية المفتاح. أضف VITE_OCR_PROXY_URL أو
              VITE_GOOGLE_VISION_API_KEY.
            </p>
          )}
        </section>

        <section className="panel">
          <div className="section-title">2) مراجعة النص</div>
          <p className="muted">
            النص المستخرج يظهر هنا لتصحيحه. يمكنك التعديل ثم حفظ الفائدة.
          </p>
          <label className="field">
            <span>النص</span>
            <textarea
              className="textarea"
              rows={8}
              value={text}
              onChange={(event) => setText(event.target.value)}
              placeholder="أدخل النص هنا بعد استخراجه..."
            />
          </label>
        </section>

        <section className="panel">
          <div className="section-title">3) بيانات الفائدة</div>
          <label className="field">
            <span>العنوان</span>
            <input
              className="input"
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              placeholder="مثال: أثر الصحبة الصالحة"
            />
          </label>
          <label className="field">
            <span>الموضوع</span>
            <input
              className="input"
              value={topic}
              onChange={(event) => setTopic(event.target.value)}
              placeholder="مثال: تربية"
            />
          </label>
          <div className="actions">
            <button
              className="btn btn-primary"
              type="button"
              onClick={saveNote}
              disabled={!canSave || saving}
            >
              {saving ? 'جارٍ الحفظ...' : draftId ? 'تحديث الفائدة' : 'حفظ الفائدة'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={resetDraft}>
              تفريغ
            </button>
          </div>
          {syncError && <div className="error">{syncError}</div>}
          <p className="hint">
            يتم الحفظ في قاعدة البيانات الخاصة بحسابك.
          </p>
        </section>

        <section className="panel wide">
          <div className="section-title">4) كل الفوائد</div>
          <div className="filter-row">
            <span className="label">تصفية حسب الموضوع</span>
            <div className="chips">
              <button
                className={`chip ${filter === 'الكل' ? 'active' : ''}`}
                onClick={() => setFilter('الكل')}
                type="button"
              >
                الكل
              </button>
              {topics.map((item) => (
                <button
                  key={item}
                  className={`chip ${filter === item ? 'active' : ''}`}
                  onClick={() => setFilter(item)}
                  type="button"
                >
                  {item}
                </button>
              ))}
            </div>
          </div>

          <div className="notes">
            {filteredNotes.length === 0 ? (
              <div className="empty">
                {loadingNotes ? 'جاري تحميل الفوائد...' : 'لا توجد فوائد بعد. ابدأ بإضافة فائدة.'}
              </div>
            ) : (
              filteredNotes.map((note) => (
                <article key={note.id} className="note">
                  <div>
                    <h3>{note.title}</h3>
                    <p className="note-text">{note.text}</p>
                    <div className="note-meta">
                      <span>{note.topic}</span>
                      <span>{new Date(note.createdAt).toLocaleString('ar')}</span>
                    </div>
                  </div>
                  <div className="actions">
                    <button className="btn btn-ghost" onClick={() => loadNote(note)}>
                      فتح
                    </button>
                    <button
                      className="btn btn-outline"
                      onClick={() => deleteNote(note.id)}
                    >
                      حذف
                    </button>
                  </div>
                </article>
              ))
            )}
          </div>
        </section>

        <section className="panel wide">
          <div className="section-title">5) التصدير</div>
          <p className="muted">
            تصدير سريع بصيغ شائعة. قد تحتاج خطوط عربية مدمجة لتظهر بشكل ممتاز.
          </p>
          <div className="actions">
            <button className="btn btn-primary" onClick={exportTxt}>
              TXT
            </button>
            <button className="btn btn-outline" onClick={exportCsv}>
              CSV (Excel)
            </button>
            <button className="btn btn-outline" onClick={exportJson}>
              JSON
            </button>
            <button className="btn btn-outline" type="button" onClick={exportPdf}>
              PDF
            </button>
            <button className="btn btn-outline" type="button" onClick={exportDocx}>
              DOCX
            </button>
          </div>
        </section>
      </main>
        </>
      )}
    </div>
  )
}

export default App
