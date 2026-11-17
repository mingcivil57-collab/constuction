import { getAccessToken } from "./auth";

async function safeFetch(url: string, options?: RequestInit): Promise<Response> {
  try {
    return await fetch(url, options);
  } catch (err: any) {
    if (err.name === "TypeError" || err.message?.includes("Failed to fetch")) {
      throw new Error("ไม่สามารถเชื่อมต่อ Google Drive API ได้ กรุณาตรวจสอบอินเทอร์เน็ตหรือเข้าสู่ระบบ Google อีกครั้ง");
    }
    throw err;
  }
}

/**
 * Searches for a folder with the given name on Google Drive.
 * If found, returns its ID. If not found, creates a new folder and returns its ID.
 */
export async function getOrCreateDriveFolder(folderName: string): Promise<string> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("กรุณาเข้าสู่ระบบด้วย Google Account ก่อนดำเนินการ");
  }

  // Escaping single quotes in folder name for safety in drive API query
  const safeFolderName = folderName.replace(/'/g, "\\'");
  const query = `mimeType = 'application/vnd.google-apps.folder' and name = '${safeFolderName}' and trashed = false`;

  // 1. Search for existing folder
  const searchUrl = `https://www.googleapis.com/drive/v3/files?q=${encodeURIComponent(query)}&fields=files(id,name)`;
  const searchRes = await safeFetch(searchUrl, {
    headers: {
      Authorization: `Bearer ${token}`,
    },
  });

  if (!searchRes.ok) {
    const errorData = await searchRes.json().catch(() => ({}));
    console.error("Google Drive folder search failed:", errorData);
    throw new Error(`ไม่สามารถค้นหาโฟลเดอร์บน Google Drive ได้ (${searchRes.status})`);
  }

  const searchData = await searchRes.json();
  if (searchData.files && searchData.files.length > 0) {
    return searchData.files[0].id;
  }

  // 2. Folder not found -> Create new folder
  const createRes = await safeFetch("https://www.googleapis.com/drive/v3/files", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      name: folderName,
      mimeType: "application/vnd.google-apps.folder",
    }),
  });

  if (!createRes.ok) {
    const errorData = await createRes.json().catch(() => ({}));
    console.error("Google Drive folder creation failed:", errorData);
    throw new Error(`ไม่สามารถสร้างโฟลเดอร์บน Google Drive ได้ (${createRes.status})`);
  }

  const createData = await createRes.json();
  return createData.id;
}

/**
 * Uploads a file to a specific Google Drive folder and returns the public viewable direct image link.
 */
export async function uploadFileToDrive(file: File, folderId: string): Promise<{ fileId: string; directUrl: string; webViewLink: string }> {
  const token = await getAccessToken();
  if (!token) {
    throw new Error("กรุณาเข้าสู่ระบบด้วย Google Account ก่อนดำเนินการ");
  }

  // Multipart upload payload construction
  const metadata = {
    name: file.name,
    parents: [folderId],
  };

  const boundary = "-------314159265358979323846";
  const delimiter = "\r\n--" + boundary + "\r\n";
  const closeDelimiter = "\r\n--" + boundary + "--";

  const arrayBuffer = await file.arrayBuffer();

  const metadataBlob = new Blob([JSON.stringify(metadata)], { type: "application/json" });
  const mediaBlob = new Blob([arrayBuffer], { type: file.type || "image/jpeg" });

  const bodyBlob = new Blob([
    delimiter,
    "Content-Type: application/json; charset=UTF-8\r\n\r\n",
    metadataBlob,
    delimiter,
    `Content-Type: ${file.type || "image/jpeg"}\r\n\r\n`,
    mediaBlob,
    closeDelimiter,
  ]);

  // Upload request
  const uploadRes = await safeFetch(
    "https://www.googleapis.com/upload/drive/v3/files?uploadType=multipart&fields=id,name,webViewLink,webContentLink",
    {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": `multipart/related; boundary=${boundary}`,
      },
      body: bodyBlob,
    }
  );

  if (!uploadRes.ok) {
    const errorData = await uploadRes.json().catch(() => ({}));
    console.error("Google Drive upload failed:", errorData);
    throw new Error(`อัปโหลดไฟล์ไปยัง Google Drive ไม่สำเร็จ (${uploadRes.status})`);
  }

  const uploadData = await uploadRes.json();
  const fileId = uploadData.id;

  // Make the file publicly readable so the image can be embedded/viewed directly in the web app
  try {
    await safeFetch(`https://www.googleapis.com/drive/v3/files/${fileId}/permissions`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        role: "reader",
        type: "anyone",
      }),
    });
  } catch (permError) {
    console.warn("Failed to set public permission on Drive file:", permError);
  }

  // Direct thumbnail/view URL for Google Drive files
  const directUrl = `https://lh3.googleusercontent.com/d/${fileId}`;
  const webViewLink = uploadData.webViewLink || `https://drive.google.com/file/d/${fileId}/view`;

  return {
    fileId,
    directUrl,
    webViewLink,
  };
}
