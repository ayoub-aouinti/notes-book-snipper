import { useEffect, useMemo, useState } from 'react'
import './App.css'

type Note = {
  id: string
  title: string
  topic: string
  text: string
  sourceImage?: string
  createdAt: string
}

const STORAGE_KEY = 'notes_book_app_v1'

function App() {
  const [notes, setNotes] = useState<Note[]>([])
  const [title, setTitle] = useState('')
  const [topic, setTopic] = useState('')
  const [text, setText] = useState('')
  const [sourceImage, setSourceImage] = useState<string | undefined>(undefined)
  const [filter, setFilter] = useState('الكل')
  const [draftId, setDraftId] = useState<string | null>(null)

  useEffect(() => {
    const raw = localStorage.getItem(STORAGE_KEY)
    if (!raw) return
    try {
      const parsed = JSON.parse(raw) as Note[]
      setNotes(parsed)
    } catch {
      setNotes([])
    }
  }, [])

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(notes))
  }, [notes])

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
    if (!text.trim()) {
      setText('نسخة أولية من النص بعد OCR. يمكنك تصحيحها هنا...')
    }
  }

  const resetDraft = () => {
    setTitle('')
    setTopic('')
    setText('')
    setSourceImage(undefined)
    setDraftId(null)
  }

  const saveNote = () => {
    if (!canSave) return
    const now = new Date().toISOString()
    if (draftId) {
      setNotes((prev) =>
        prev.map((note) =>
          note.id === draftId
            ? { ...note, title, topic, text, sourceImage, createdAt: now }
            : note
        )
      )
    } else {
      const note: Note = {
        id: crypto.randomUUID(),
        title: title.trim() || 'مقتطف بلا عنوان',
        topic: topic.trim() || 'غير مصنف',
        text: text.trim(),
        sourceImage,
        createdAt: now,
      }
      setNotes((prev) => [note, ...prev])
    }
    resetDraft()
  }

  const loadNote = (note: Note) => {
    setDraftId(note.id)
    setTitle(note.title)
    setTopic(note.topic)
    setText(note.text)
    setSourceImage(note.sourceImage)
  }

  const deleteNote = (id: string) => {
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

  const exportTxt = () => {
    const grouped = notes.reduce<Record<string, Note[]>>((acc, note) => {
      const key = note.topic || 'غير مصنف'
      acc[key] = acc[key] ? [...acc[key], note] : [note]
      return acc
    }, {})
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

  return (
    <div className="app" dir="rtl" lang="ar">
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
          <span className="label">تسجيل الدخول</span>
          <div className="actions">
            <button className="btn btn-outline" type="button">
              Google
            </button>
            <button className="btn btn-outline" type="button">
              Facebook
            </button>
            <button className="btn btn-outline" type="button">
              بريد إلكتروني
            </button>
          </div>
          <p className="hint">الواجهة جاهزة، اربطها بخدمة التوثيق لاحقا.</p>
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
          </div>
          {sourceImage && (
            <div className="pill">آخر ملف: {sourceImage}</div>
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
              disabled={!canSave}
            >
              {draftId ? 'تحديث الفائدة' : 'حفظ الفائدة'}
            </button>
            <button className="btn btn-ghost" type="button" onClick={resetDraft}>
              تفريغ
            </button>
          </div>
          <p className="hint">
            يتم الحفظ محليا على الجهاز. اربط التخزين بقاعدة بيانات لاحقا.
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
              <div className="empty">لا توجد فوائد بعد. ابدأ بإضافة فائدة.</div>
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
            تصدير سريع بصيغ شائعة. لإخراج Word أو PDF احترافي اربط بخدمة سيرفر
            أو مكتبة مخصصة.
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
            <button className="btn btn-ghost" type="button">
              PDF (قريبا)
            </button>
            <button className="btn btn-ghost" type="button">
              DOCX (قريبا)
            </button>
          </div>
        </section>
      </main>
    </div>
  )
}

export default App

