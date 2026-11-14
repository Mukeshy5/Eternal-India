# Joining and experience letters

Both panels use the same `employment_letters` collection and route handlers. Open **People → Joining Letter** or **People → Experience Letter** at `/admin/joining-letters`, `/admin/experience-letters`, `/technical/joining-letters` or `/technical/experience-letters`.

## Workflow

1. Add an employee in Staff Management. Joining date and monthly gross salary are optional staff fields; older records continue to work.
2. Create a letter, search and select an employee. Name, employee ID, designation and department are fetched from the existing staff collection. Joining date and salary prefill from staff records, or the most recent saved joining letter when the staff fields are empty.
3. Review issue/employment dates, salary, company/signatory details and wording. Experience letters require responsibilities and performance descriptions. Duration includes the last working day and uses calendar anniversaries.
4. Review the live letterhead or server PDF preview. Draft previews are marked **NOT ISSUED** and create no database document or reference reservation.
5. Generate and save. The backend assigns an `EI/JL/YYYY/000001` or `EI/EL/YYYY/000001` reference and saves the letter and final PDF together. Preview, print and download use that saved PDF.
6. History supports employee/reference/department/designation search, issue-date filters and pagination. History refreshes every 15 seconds while visible and on window focus. Concurrent editors receive a conflict instead of overwriting each other.

Company defaults reuse the existing company configuration and shared voucher branding/address. An account with staff edit permission can save company/signatory details as shared defaults for future letters. Each generated letter keeps its own company and employee snapshot. Editing company defaults or staff later does not rewrite issued letters. Existing historical letters can still be viewed and amended after staff deletion. Editing an issued letter preserves its reference and increments its version.

## Storage and permissions

Startup installs strict MongoDB JSON schemas and indexes. `employment_letters` stores the employee reference/snapshot, company snapshot, employment fields, editable content, PDF binary, SHA-256 integrity hash, optimistic version and creator/updater identities and timestamps. PDFs are deliberately embedded in the same MongoDB document as the letter so a successful save cannot leave a missing file or mismatched PDF. Input limits keep documents below MongoDB's document limit. Include this collection in normal encrypted database backups; there are no public file URLs, disk upload directories or expiry indexes for letters.

Existing HttpOnly JWT authentication and account/panel checks apply to every route. Existing staff permissions are reused:

| Permission | Letter actions |
| --- | --- |
| `view` | Read history, saved letter content, employees and company defaults |
| `create` + `view` | Generate a new letter |
| `edit` + `view` | Amend a letter; update shared company defaults |
| `export` + `view` | Download, print and view stored PDFs; draft PDF preview additionally requires create or edit |
| `delete` + `view` | Permanently delete a letter and its embedded PDF |

Employee identity is fetched server side; client-supplied employee details and document numbers are ignored. One letter of each type is allowed per employee and joining date; a rehired employee may have a distinct employment period. Database unique indexes enforce this under concurrent requests. Request UUIDs make unchanged creation retries idempotent. Monotonic per-type/year counters are never reset or decremented, including after deletion or failed generation; gaps are expected and numbers are never reused. PDF generation is rate limited per authenticated account. PDFs are served with private/no-store headers and their integrity is checked before download. Production MongoDB encryption, network access restrictions and backup policy remain deployment responsibilities.

Deletion requires confirmation in the panel and the current record version. It permanently removes both metadata and PDF. Staff deletion does not delete letters. There is no localStorage persistence or seeded application data.

## REST API

All paths below follow either `/api/admin` or `/api/technical`.

| Method | Path | Purpose |
| --- | --- | --- |
| GET | `/letters/settings` | Company defaults, version and current permissions |
| PUT | `/letters/settings` | Save `{ company, version }` |
| GET | `/letters/employees?search=&page=` | Paginated employee search, including inactive employees |
| GET | `/letters/employees/:id` | Employee details and employment defaults |
| GET | `/letters?type=joining&search=&staffId=&from=&to=&page=` | Filtered history (`from/to` are issue dates) |
| POST | `/letters/preview` | Validated draft PDF; supply `id` and `version` when editing |
| POST | `/letters` | Generate and save a new letter; requires `requestKey` UUID |
| GET | `/letters/:id` | Saved letter metadata/content, without binary |
| PATCH | `/letters/:id` | Validate and atomically replace content/PDF; requires current `version` |
| GET | `/letters/:id/pdf?download=true` | Protected saved PDF (`download` optional) |
| DELETE | `/letters/:id` | Permanently delete using `{ version }` |

Create/amend bodies include `type`, `staffId`, `issueDate`, `joiningDate`, `company`, `content`, `terms`, `responsibilities` and `performance`. Joining letters additionally use `salary` in INR with up to two decimal places and `salaryPeriod` (`month` or `year`). Experience letters use `lastWorkingDate`. `company` includes `name`, `address`, `phone`, `website`, `signatory` and `signatoryTitle`. Blank letter content selects the standard wording. Dates use `YYYY-MM-DD` within 2000–2100. Experience issue dates cannot precede the last working date. Validation returns field-level errors; stale writes and duplicates return HTTP 409. Employee/type identity cannot be changed on saved letters. Previewing or editing does not change the staff record.

## Verification and rollout

No new dependencies, environment variables or manual migration are required. Restart/redeploy the backend and rebuild the frontend together. Startup creates the collections/indexes in the configured MongoDB database; the database account must have the same collection/index/schema permissions used by Staff Management.

```powershell
node --test --test-concurrency=1 Backend/test/letters.test.js
npm --prefix frontend run verify:letters
npm --prefix frontend run build
```

The API and UI integration tests use real HTTP and MongoDB in unique `eternal_india_test_*` databases and delete only their own database afterward. They cover both panels, permissions, company defaults, staff autofill, preview without persistence, duplicate/idempotent/concurrent creation, amendments, stale versions, search, PDF bytes/integrity, print invocation, permanent deletion and restart persistence. Set `LETTER_QA_DIR` to a workspace directory when running backend tests to retain sample PDFs for visual inspection. These are test fixtures only; tests do not seed the application database.
