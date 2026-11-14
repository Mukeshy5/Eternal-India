import { useEffect, useState } from "react";
import { api } from "../api";
import { defaultCertificationImageId } from "../../../../shared/companyCertifications.js";

export default function LetterCertification({ imageId = defaultCertificationImageId, apiBase, onError }) {
  const [image, setImage] = useState(null), [failed, setFailed] = useState(false), [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController(); setImage(null); setFailed(false);
    api(`${apiBase}/letters/certifications/${imageId}`, { signal: controller.signal }).then((result) => {
      if (!controller.signal.aborted) setImage({ id: imageId, src: result.dataUrl });
    }).catch((error) => { if (!controller.signal.aborted) { setFailed(true); onError?.(error); } });
    return () => controller.abort();
  }, [imageId, apiBase, retry, onError]);
  return <div className="letter-certification-image">
    {failed ? <span role="alert">Certification image could not be loaded. <button type="button" onClick={() => setRetry((value) => value + 1)}>Retry</button></span> : image?.id === imageId ? <img src={image.src} alt="Company certification" onError={() => setFailed(true)} /> : <span role="status">Loading company certification…</span>}
  </div>;
}
