// Server Component wrapper — satisfaz output:export com generateStaticParams
// O Client Component CategoryPageClient lê o slug via useParams()

import CategoryPageClient from './CategoryPageClient.js';
import { supabase } from '../../../lib/supabaseClient';

/**
 * generateStaticParams is executed at build time.
 * We fetch all active category slugs from the Supabase database
 * so Next.js can pre-render physical static files for each category.
 */
export async function generateStaticParams() {
  try {
    const { data: categories, error } = await supabase
      .from('categories')
      .select('slug');

    if (error || !categories || categories.length === 0) {
      console.warn('⚠️ No categories found in Supabase at build time, using fallback placeholder.');
      return [{ slug: '_placeholder' }];
    }

    return categories.map((cat) => ({
      slug: cat.slug,
    }));
  } catch (err) {
    console.error('❌ Failed to fetch categories at build time:', err);
    return [{ slug: '_placeholder' }];
  }
}

export default function CategoryPage() {
  return <CategoryPageClient />;
}
