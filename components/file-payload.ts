// 업로드 파일 → API 요청 본문의 files[] 항목
// 카톡 txt는 text, 이미지는 base64 data URL(dataUrl)로 보낸다.

export interface UploadFile {
  name: string;
  kind: "kakao" | "image" | "text";
  text: string;
  dataUrl?: string;
}

function readDataUrl(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

export async function toUploadFile(file: File): Promise<UploadFile> {
  if (file.type.startsWith("image")) {
    return { name: file.name, kind: "image", text: "", dataUrl: await readDataUrl(file) };
  }
  return { name: file.name, kind: "kakao", text: await file.text() };
}
