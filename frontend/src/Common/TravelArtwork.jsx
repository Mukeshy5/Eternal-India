export default function TravelArtwork({ theme = "north" }) {
  return (
    <svg className="travel-artwork" viewBox="0 0 500 360" fill="none" aria-hidden="true">
      <rect width="500" height="360" rx="12" fill="currentColor" opacity=".08" />
      <circle cx="365" cy="93" r="43" fill="#d8b16a" opacity=".75" />
      <path d="M22 262 146 102l76 100 60-61 197 148H22Z" fill="currentColor" opacity=".16" />
      <path d="m120 137 26-35 31 42-30-12-27 5Z" fill="#faf8f3" />
      <path d="M0 288c100-70 160-32 246-15s160-40 254-2v89H0Z" fill="currentColor" opacity=".23" />
      <path d="M0 322c102-23 163-4 230 8s170-26 270-2" stroke="#faf8f3" strokeWidth="3" opacity=".75" />
      {theme === "south" || theme === "west" ? <>
        <path d="M121 301c0-66 0-119-24-165" stroke="currentColor" strokeWidth="9" strokeLinecap="round" />
        <path d="M97 139c-35-40-61-9-63 1 25-14 38-9 63 1Zm0 0c22-46 60-32 65-14-27-8-44-3-65 16Zm0 0c-2-43-35-55-50-39 23 2 36 17 50 41Zm0 0c39-8 57 25 50 43-9-25-27-34-50-41Z" fill="currentColor" />
      </> : theme === "central" ? <>
        <path d="M77 296V190h20v-33h20v33h20v-42h20v42h20v106H77Z" fill="currentColor" opacity=".6" />
        <path d="M109 296v-49a18 18 0 0 1 36 0v49" fill="#faf8f3" />
      </> : <>
        <path d="M75 301v-45h22v-42h25v42h22v45H75Z" fill="currentColor" opacity=".55" />
        <path d="m95 214 15-28 15 28" fill="currentColor" opacity=".55" />
      </>}
      <path d="M282 275c70-65 141-62 143-112 2-32-48-34-49-8" stroke="currentColor" strokeWidth="2" strokeDasharray="6 7" opacity=".45" />
      <circle cx="281" cy="275" r="5" fill="currentColor" />
      <circle cx="376" cy="155" r="5" fill="currentColor" />
    </svg>
  );
}
