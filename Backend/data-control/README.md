# Data Control

The Technical Panel menu opens `/technical/data-control`. Six history tabs read the existing business collections; Storage & Backup Management manages measurements, backups, policy, optimization, recovery, cleanup reports and audits. The Technical Panel dashboard also shows storage usage.

## Deployment

Set `DATA_CONTROL_BACKUP_DIR` to a **persistent mounted disk** in production. Production backup creation refuses to use an ephemeral default. `DATA_CONTROL_UPLOAD_DIR` and `DATA_CONTROL_TEMP_DIR` point to any local runtime files. These three directories must be separate, readable and writable by the backend, and contain no symbolic links. Defaults for development are `Backend/var/backups/<database-name>`, `Backend/var/uploads` and `Backend/var/temporary`; they are gitignored. Keep database files outside these roots. Existing uploaded images, photos and letter files are stored in MongoDB and are measured there automatically.

Run the normal backend (`npm --prefix Backend start`). The persistent scheduler polls every minute; schedules and job locks live in MongoDB and survive restarts. It catches up with one overdue backup after restart, with an hourly retry after failures. Daily means every day after the configured policy time, weekly every seven days, monthly the next calendar month. There is no background process when the host is asleep or the server is stopped; use an always-running backend for unattended backups. The default is daily backup, 30-day backup retention, **cleanup disabled**. Saving policy resets the next backup time. Keep sufficient free space for a new compressed backup and a restore safety backup.

The application needs MongoDB permissions for `dbStats`, ordinary business reads/writes, index management, and the Data Control metadata collections. No credentials or live sessions are included in backups. The database connection and its underlying infrastructure are unchanged.

## Storage budget

Capacity is `500 * 1024 * 1024` bytes (the UI labels this 500 MB). Usage is real `dbStats.storageSize + dbStats.indexSize`, plus external uploads, temporary files and all files in the backup directory, including in-progress files. Embedded image/photo/document payload sizes use MongoDB `$binarySize` and are an informational subset of database storage and are never added twice. Per-selection estimates use MongoDB `$bsonSize` and exclude shared index/allocation overhead.

MongoDB may retain freed pages for reuse after deletion. A deletion estimate is **document bytes**, not a promise of immediately reclaimed disk space. The interface shows this distinction. [MongoDB dbStats reference](https://www.mongodb.com/docs/manual/reference/command/dbstats/).

HTTP writes reserve growth space before admission, including multipart uploads; simultaneous reservations are serialized using MongoDB leases. New HTTP writes and integrated enquiry ingestion fail closed if their reservation cannot fit. Normal writes and maintenance do not overlap. At least 2 MB is reserved for ordinary HTTP writes, or twice Content-Length if larger. Incoming enquiry ingestion also reserves its message size. Authentication, audit metadata and existing internal scheduler updates need a small amount of operational headroom. An application guard cannot constrain direct database clients, external filesystem writers or MongoDB's own allocation/index growth: enforce the matching provider/disk quota as well, and respond to the 70/80/90/95% warnings before saturation. No fabricated usage or historical samples are used. Hourly measurement samples are retained for 400 days; charts group real samples by IST day/week/month/year.

## Backups and recovery

Backups are gzip-compressed, streaming Extended JSON with an allowlist of business collections, BSON types, a manifest/footer, associated local file chunks and per-file SHA-256 digests. Credentials, tokens and live sessions are excluded deliberately. Full backups include the existing business records, supporting assets, numbering counters and request ledgers. Scoped backups include filtered records, relevant supporting collections and local files. Some supporting collections/files are included in full to preserve dependencies. They are business backups, not a replacement for a provider-managed MongoDB disaster-recovery snapshot: existing collection validators and indexes are not exported, and auth/configuration requires separate infrastructure recovery.

Every backup is read back completely and checked against its compressed checksum, record counts, file checksums and footer before it becomes `verified`. Creation fails safely if the compressed data cannot fit in the remaining budget. A partial file is removed on handled failures. After a crash, the scheduler waits for the distributed lease to expire, marks abandoned running backups failed and removes their incomplete backup artifacts. Completed files awaiting verification are verified or marked invalid. These bytes remain counted until recovery; incomplete files are never treated as valid backups.

Restore requires `RESTORE <backup-id>`, a verified source, sufficient headroom and a fresh verified full safety backup. It **inserts missing records and files only**. Existing documents and conflicting unique keys are skipped; financial counters only increase. There is no database reset or overwrite mode. It is resumable, not an all-or-nothing transaction: if interrupted, audit logs record progress and another confirmed restore skips already-restored records. Restore reports include inserted/skipped counts and the safety backup ID. Existing schemas and unique indexes continue to apply. Downloaded archives can be independently read with gzip plus MongoDB Extended JSON tooling; only server-managed backup IDs can be restored through the API.

Manual backups download immediately. Optional automatic browser downloads run only while Backup Management remains open and the browser permits downloads. Backend schedules always create server-side files, independently of the browser. Backup retention preserves a fully verified full backup and validates a surviving backup before deleting another one.

## Safe history management

Filter by literal search and inclusive IST dates; manage day, Monday–Sunday week, month, year or custom intervals. Pagination is 25/50/100 rows server-side (25 in the UI), with up to 200 selected IDs and 5,000 records per confirmation. CSV/JSON stream large exports; Excel and PDF reports cap at 10,000 records. CSV/Excel neutralize spreadsheet formula strings. CSV includes full record JSON; Excel includes a separate lossless JSON-chunks worksheet. PDF is a readable summary; use JSON or backup for full fidelity.

Deletion requires an unexpired, actor-bound preview and explicit confirmation. The preview contains record count, dates and estimated document bytes. It freezes each record ID and SHA-256 digest. The backend creates a fresh full backup, verifies that it contains every exact selected version, writes a cleanup report and audit entry, then performs conditional changes only if each document is unchanged. Changed records are skipped, and partial outcomes are reported.

Only already-archived closed/resolved enquiries without pending events, and read notifications older than one day, can be deleted. Financial/legal/attendance history is retained: payments, vouchers, invoices and attendance are archived with metadata instead. Archived financial data remains in MongoDB and releases no bytes. Automatic cleanup accepts only the enquiry and notification sections, requires an explicitly enabled retention policy plus scheduled backups, and processes up to 200 eligible records per section per run. It never resets a collection/database.

The old destructive startup cleanup and upload/history TTL expiry have been removed from automatic startup. Reference-aware optimization backs up and verifies before deleting expired, unreferenced temporary images/files, and repeats reference checks. Duplicate hashes are reported, with active referenced duplicates preserved. New offer/festival images are bounded, optimized when smaller and deduplicated per uploader; signed/legal files, staff photos and animations retain their established handling. Existing authenticated manual business DELETE endpoints also create a verified full backup and hold the maintenance lock until the response finishes. Replaced offer/festival images wait for backup-gated optimization. Data Control supplies the detailed selection preview for historical bulk management.

## API

All endpoints are below `/api/technical/data-control`, use the existing cookie/JWT session validation and require the technical role:

- `GET /catalog`, `/storage`, `/statistics?period=day|week|month|year`
- `GET /records/:section` with `from`, `to`, `search`, `status`, `archived`, `page`, `pageSize`
- `POST /records/:section/export` with `{ format, filter }`
- `POST /records/:section/preview` with `{ filter }`
- `POST /records/execute` with `{ previewId, confirm: true }`
- `GET /backups?page=1`; `POST /backups` with optional `{ section, filter }`
- `GET /backups/:id/download`; `POST /backups/:id/verify`
- `POST /backups/:id/restore` with `{ confirmation: "RESTORE <id>" }`
- `DELETE /backups/:id` with `{ confirm: true }`
- `GET /policy`; `PUT /policy` with frequency, backupRetentionDays, retentionDays, cleanupEnabled, cleanupSections
- `POST /cleanup` with `{ confirm: true }`
- `GET /optimization`; `POST /optimization` with `{ confirmation: "OPTIMIZE STORAGE" }`
- `GET /audit?page=1`, `/reports?page=1`

Run `node --test --test-force-exit --test-concurrency=1 test/data-control.test.js` from Backend. Integration tests use a randomly named isolated database and temporary file roots, then remove those fixtures. The configured MongoDB URI must permit creating/dropping that temporary database. Production business records are never used as test fixtures.
