import { useEffect, useId, useRef, useState } from 'react'
import { BUSINESS_PERMIT, TRICYCLE_PERMIT, ZONING_CLEARANCE, services } from '../../services.js'
import { StaffIcon } from './staff-shell'

const steps = ['Choose a service', 'Applicant details', 'Upload documents']

function fieldsFor(service) {
  const zoning = service === ZONING_CLEARANCE
  const tricycle = service === TRICYCLE_PERMIT
  if (service === BUSINESS_PERMIT) return [['title', 'Business name', 120]]
  return [
    ['title', tricycle ? 'Operator name' : zoning ? 'Applicant or project name' : 'Full name', 120],
    tricycle ? ['vehicle_identifier', 'Fictional plate or unit ID', 40]
      : ['address', zoning ? 'Site address' : 'Address', 240, 2],
    ['purpose', tricycle ? 'Proposed route or zone' : zoning ? 'Proposed use' : 'Purpose of request', 500, 3],
  ]
}

export default function ResidentApplication({ application, busy, submit, onCancel }) {
  const [step, setStep] = useState(application ? 1 : 0)
  const [service, setService] = useState(application ? application.service ?? BUSINESS_PERMIT : '')
  const [values, setValues] = useState(() => application
    ? Object.fromEntries(fieldsFor(application.service ?? BUSINESS_PERMIT).map(([name]) => [name, application[name] ?? '']))
    : {})
  const [files, setFiles] = useState({})
  const [issues, setIssues] = useState({})
  const [requestError, setRequestError] = useState('')
  const heading = useRef(null)
  const summary = useRef(null)
  const prefix = useId()
  const zoning = service === ZONING_CLEARANCE
  const fields = service ? fieldsFor(service) : []
  const documents = service ? services[service].documents : []
  const populated = Object.values(values).some(value => value.trim()) || Object.values(files).some(Boolean)

  useEffect(() => { heading.current?.focus() }, [step])
  useEffect(() => { summary.current?.focus() }, [issues, requestError])

  function goTo(next) {
    setIssues({})
    setRequestError('')
    setStep(next)
  }

  function chooseService(next) {
    if (next !== service && populated) {
      if (!window.confirm('Switch services and discard the details and files you entered?')) return
      setValues({})
      setFiles({})
    }
    setService(next)
    setIssues({})
  }

  function advance(event) {
    event.preventDefault()
    if (busy) return
    const errors = {}
    if (step === 0 && !service) errors.service = 'Choose a municipal service.'
    if (step === 1) {
      for (const [name, label] of fields) if (!values[name]?.trim()) errors[name] = `Enter ${label.toLowerCase()}.`
    }
    if (step === 2) {
      for (const [name, label] of documents) {
        const file = files[name]
        if (!file && !zoning) errors[name] = `Attach a PDF for ${label.toLowerCase()}.`
        else if (file && file.size > 5 * 1024 * 1024) errors[name] = 'Choose a PDF that is 5 MB or smaller.'
        else if (file && !/\.pdf$/i.test(file.name) && file.type !== 'application/pdf') errors[name] = 'Choose a PDF file.'
      }
    }
    setIssues(errors)
    setRequestError('')
    if (Object.keys(errors).length) return
    if (step < 2) {
      goTo(step + 1)
      return
    }
    const data = new FormData()
    data.set('service', service)
    for (const [name] of fields) data.set(name, values[name].trim())
    for (const [name] of documents) if (files[name]) data.set(name, files[name])
    submit(data, setRequestError)
  }

  const fieldProps = name => ({
    id: prefix + name,
    'aria-invalid': issues[name] ? true : undefined,
    'aria-describedby': issues[name] ? prefix + name + '-error' : undefined,
  })
  const fieldError = name => issues[name] && <p className="resident-field-error" id={prefix + name + '-error'}>{issues[name]}</p>

  return <section className="panel resident-wizard" aria-labelledby={prefix + 'heading'}>
    <ol className="resident-steps" aria-label="Application progress">
      {steps.map((label, index) => (!application || index > 0) && <li key={label}
        aria-current={index === step ? 'step' : undefined} data-complete={index < step}>
        <span aria-hidden="true">{application ? index : index + 1}</span>{label}
      </li>)}
    </ol>
    {application && <p className="resident-service-name">{services[service].label}</p>}
    <h3 tabIndex={-1} ref={heading} id={prefix + 'heading'}>{steps[step]}</h3>
    <form className="stack" noValidate onSubmit={advance}>
      {(Object.keys(issues).length > 0 || requestError) && <div className="error" role="alert" tabIndex={-1} ref={summary}>
        <strong>{requestError ? 'Application could not be saved' : 'Check the following fields'}</strong>
        {requestError && <p>{requestError}</p>}
        {Object.keys(issues).length > 0 && <ul>{Object.entries(issues).map(([name, message]) =>
          <li key={name}><a href={'#' + prefix + name}>{message}</a></li>)}</ul>}
      </div>}
      {step === 0 && <fieldset className="resident-service-options">
        <legend>Municipal services</legend>
        {Object.entries(services).map(([id, { label, documents: requirements }], index) => <label className="resident-service" key={id}>
          <input {...(index === 0 ? fieldProps('service') : {})} type="radio" name="service-choice"
            checked={service === id} required onChange={() => chooseService(id)} />
          <StaffIcon name="applications" />
          <span><strong>{label}</strong><small>{requirements.length} {requirements.length === 1 ? 'document' : 'documents'}</small></span>
        </label>)}
        {fieldError('service')}
      </fieldset>}
      {step === 1 && fields.map(([name, label, maxLength, rows]) => {
        const props = { ...fieldProps(name), required: true, maxLength, value: values[name] ?? '',
          onChange: event => setValues({ ...values, [name]: event.target.value }) }
        return <div key={name}>
          <label htmlFor={prefix + name}>{label}</label>
          {rows ? <textarea {...props} rows={rows} /> : <input {...props} />}
          {fieldError(name)}
        </div>
      })}
      {step === 2 && <>
        <p>Use fictional PDF documents, up to 5 MB per file.</p>
        {application && <p>{zoning ? 'Reattach every PDF you want included in this revision.' : 'Reattach a PDF for every requirement. Previous uploads are stored with the earlier revision.'}</p>}
        {zoning && <p>You can submit with missing PDFs. Staff needs all three before approval.</p>}
        {documents.map(([name, label, sample, alternate, alternateLabel]) => <div className="resident-upload" key={name}>
          <div className="resident-upload-label">{label}{zoning && <small>Optional for submission</small>}</div>
          <button {...fieldProps(name)} type="button" className="button secondary" disabled={busy}
            aria-label={`Choose file for ${label}`}
            onClick={() => document.getElementById(prefix + name + '-file').click()}>Choose file</button>
          <input hidden id={prefix + name + '-file'} type="file" accept=".pdf,application/pdf" disabled={busy}
            onChange={event => {
              const file = event.target.files[0]
              if (file) setFiles({ ...files, [name]: file })
              event.target.value = ''
            }} />
          {files[name] && <div className="resident-file">
            <span>Selected: {files[name].name}</span>
            <button type="button" className="button secondary" disabled={busy} aria-label={`Remove ${label} file`}
              onClick={() => setFiles({ ...files, [name]: undefined })}>Remove</button>
          </div>}
          {fieldError(name)}
          <div className="document-links">
            <a href={'/samples/' + sample} download>Download sample</a>
            {alternate && <a href={'/samples/' + alternate} download>{alternateLabel ?? 'Download incomplete sample'}</a>}
            {service === BUSINESS_PERMIT && name === 'premises' && <a href="/samples/incomplete-premises-declaration.pdf" download>Download incomplete sample</a>}
          </div>
        </div>)}
      </>}
      <div className="resident-form-actions">
        <button className="button primary" disabled={busy}>{busy ? 'Submitting…' : step < 2 ? 'Continue' : application ? 'Resubmit application' : 'Submit application'}</button>
        {step > (application ? 1 : 0) && <button type="button" className="button secondary" disabled={busy} onClick={() => goTo(step - 1)}>Back</button>}
        {onCancel && <button type="button" className="button secondary" disabled={busy} onClick={() => {
          if (!populated || window.confirm('Discard this application draft?')) onCancel()
        }}>Cancel</button>}
      </div>
    </form>
  </section>
}
