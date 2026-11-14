import { defaultLetterContent, employmentDuration, letterDate, letterFacts, letterTypes } from "../../../../shared/employmentLetters.js";
import LetterCertification from "./LetterCertification";

export default function LetterDocument({ letter, apiBase, draft = false }) {
  const document = { ...letter, salaryPaise: letter.salaryPaise ?? Math.round(Number(letter.salary || 0) * 100), employee: letter.employee || { name: "", employeeId: "", designation: "", department: "" } };
  return <article className="letter-paper" aria-label={`${draft ? "Draft " : ""}${letterTypes[letter.type]}`}>
    <div className="letter-document-content">
    <header className="letter-letterhead"><img src="/logo.webp" alt="Eternal India" /><div><strong>{letter.company.name}</strong><p>{letter.company.address}</p></div></header>
    {draft && <p className="letter-draft-mark">DRAFT PREVIEW · NOT ISSUED</p>}
    <h2>{letterTypes[letter.type]}</h2>
    <div className="letter-reference"><span>{letter.letterNumber || "Reference assigned on generation"}</span><span>{letterDate(letter.issueDate)}</span></div>
    <dl className="letter-facts">{letterFacts(document).map(([label, value]) => <div key={label}><dt>{label}</dt><dd>{value || "—"}</dd></div>)}</dl>
    <p className="letter-body">{letter.content || defaultLetterContent(document)}</p>
    {[["Terms and conditions", letter.terms], ["Job responsibilities", letter.responsibilities], ["Performance and conduct", letter.performance]].map(([title, content]) => content ? <section key={title}><h3>{title}</h3><p className="letter-body">{content}</p></section> : null)}
    <div className="letter-signature"><p>For {letter.company.name}</p><strong>{letter.company.signatory}</strong><p>{letter.company.signatoryTitle}</p></div>
    {letter.type === "joining" && <p className="letter-acceptance">Employee acceptance<br />Signature: ____________________ &nbsp; Date: ______________</p>}
    </div>
    <footer className="letter-document-footer"><div className="letter-certification-heading">Company certification</div><LetterCertification imageId={letter.company.certificationImageId} apiBase={apiBase} /><div className="letter-footer-contact">{[letter.company.phone, letter.company.website].filter(Boolean).join(" · ")}</div></footer>
    {letter.type === "experience" && <span className="letter-sr-only">{employmentDuration(letter.joiningDate, letter.lastWorkingDate)}</span>}
  </article>;
}
