import { defaultLetterContent, letterDate, letterFacts, letterTypes } from "../../../../shared/employmentLetters.js";
import LetterCertification from "./LetterCertification";

export default function LetterDocument({ letter, apiBase, draft = false }) {
  const document = { ...letter, salaryPaise: letter.salaryPaise ?? Math.round(Number(letter.salary || 0) * 100), employee: letter.employee || { name: "", employeeId: "", designation: "", department: "" } };
  return <article className="letter-paper" aria-label={`${draft ? "Draft " : ""}${letterTypes[letter.type]}`}>
    <div className="letter-document-content">
    <header className="letter-letterhead"><img src="/logo.webp" alt="Eternal India" /><div><strong>{letter.company.name}</strong><p>{letter.company.address}</p></div></header>
    {draft && <p className="letter-draft-mark">DRAFT PREVIEW · NOT ISSUED</p>}
    <h2>{letterTypes[letter.type]}</h2>
    <div className="letter-reference">{letter.letterNumber && <span>Reference: {letter.letterNumber}</span>}<span>Issue date: {letterDate(letter.issueDate)}</span></div>
    <p className="letter-facts">{letterFacts(document).map(([label, value]) => `${label} — ${value || "—"}`).join("\n")}</p>
    <p className="letter-body">{letter.content || defaultLetterContent(document)}</p>
    {letter.type === "joining" && <p className="letter-acceptance">Employee acceptance<br />Signature: ____________________ &nbsp; Date: ______________</p>}
    </div>
    <footer className="letter-document-footer"><div className="letter-certification-heading">Company certification</div><LetterCertification imageId={letter.company.certificationImageId} apiBase={apiBase} /><div className="letter-footer-contact">{[letter.company.phone, letter.company.website].filter(Boolean).join(" · ")}</div></footer>
  </article>;
}
