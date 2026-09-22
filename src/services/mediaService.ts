import { invoke } from '@tauri-apps/api/core'

/**
 * Saves a base64 image or attachment to the project's .cgli/attachments directory.
 * Returns the absolute path of the saved file on disk so agents can access/read it.
 */
export async function saveAttachment(
  projectPath: string,
  filename: string,
  base64Data: string
): Promise<string> {
  try {
    return await invoke<string>('save_attachment', {
      projectPath,
      filename,
      base64Data,
    })
  } catch (err) {
    console.warn('Failed to save attachment via Tauri:', err)
    return ''
  }
}
