import { fetchJSON } from '../client';

// backend/core.py's pick_file() - opens a native Tk file/folder dialog
// server-side and returns the chosen path. `kind` selects the dialog's
// filter/mode; "exe"/"image" open a file picker, "folder" opens a
// directory picker (askdirectory) - used by FolderSetup and any
// type:"folder" SettingsField.
export function pickPath(kind: 'exe' | 'image' | 'folder'): Promise<{ path: string | null }> {
  return fetchJSON(`/api/pick?kind=${kind}`);
}
