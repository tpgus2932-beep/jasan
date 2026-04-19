export default function Modal({ open, onClose, title, children }) {
  if (!open) return null
  return (
    <div className={`overlay${open ? ' open' : ''}`} onClick={e => e.target === e.currentTarget && onClose()}>
      <div className="modal">
        <div className="modal-title">{title}</div>
        {children}
      </div>
    </div>
  )
}

export function FormGroup({ label, children }) {
  return (
    <div className="form-group">
      <label className="form-label">{label}</label>
      {children}
    </div>
  )
}

export function FormRow({ children }) {
  return <div className="form-row">{children}</div>
}
