// Node fetch needs its own FormData for multipart uploads; React's form transition
// tests also need the browser constructor overload accepting an HTMLFormElement.
export function browserFormData(window) {
  const NativeFormData = globalThis.FormData;
  function FormData(form) { return form ? new window.FormData(form) : new NativeFormData(); }
  FormData.prototype = NativeFormData.prototype;
  return FormData;
}
