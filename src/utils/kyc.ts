import { supabase } from './supabaseClient';

export async function uploadKycDocument(
  uri: string,
  userId: string,
  type: string
): Promise<string | null> {
  try {
    const response = await fetch(uri);
    const blob = await response.blob();
    const ext = uri.split('.').pop() || 'jpg';
    const fileName = `${type}_${Date.now()}.${ext}`;

    const { data, error } = await supabase.storage
      .from('kyc_documents')
      .upload(`${userId}/${fileName}`, blob, {
        contentType: `image/${ext}`,
      });

    if (error) throw error;
    
    const { data: { publicUrl } } = supabase.storage
      .from('kyc_documents')
      .getPublicUrl(data.path);
      
    return publicUrl;
  } catch (err) {
    console.error(`Error uploading ${type}:`, err);
    return null;
  }
}