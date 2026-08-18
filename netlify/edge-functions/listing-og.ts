export default async (request: Request) => {
  const url = new URL(request.url);
  
  // ✅ Extract ID from path: /listing/{id}
  const pathParts = url.pathname.split('/');
  const listingId = pathParts[pathParts.length - 1]; // last part

  if (!listingId || listingId === 'listing') {
    return new Response('Missing listing ID', { status: 400 });
  }

  // Fetch from your Supabase Edge Function
  const supabaseUrl = `https://lpdszzdmhzrowtppngjb.supabase.co/functions/v1/listing-og?id=${listingId}`;
  const response = await fetch(supabaseUrl);
  const html = await response.text();

  return new Response(html, {
    status: response.status,
    headers: {
      'Content-Type': 'text/html; charset=utf-8',
      'Cache-Control': 'public, max-age=86400, s-maxage=604800, stale-while-revalidate=86400',
    },
  });
};