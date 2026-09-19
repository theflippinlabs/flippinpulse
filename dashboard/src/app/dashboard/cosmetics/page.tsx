import { supabase } from '@/lib/supabase';

export const dynamic = 'force-dynamic';

interface Cosmetic {
  discord_id: string;
  title: string | null;
  color_hex: string | null;
  name_color_hex: string | null;
  name_color_expires_at: string | null;
  updated_at: string;
}

async function load(): Promise<Cosmetic[]> {
  const { data } = await supabase
    .from('user_cosmetics')
    .select('discord_id, title, color_hex, name_color_hex, name_color_expires_at, updated_at')
    .order('updated_at', { ascending: false })
    .limit(200);
  return (data ?? []) as Cosmetic[];
}

function Swatch({ hex }: { hex: string | null }) {
  if (!hex) return <span className="text-pulse-mute">—</span>;
  return (
    <div className="flex items-center gap-2">
      <span className="w-4 h-4 rounded border border-pulse-border" style={{ background: hex }} />
      <span className="font-mono text-xs">{hex}</span>
    </div>
  );
}

export default async function CosmeticsPage() {
  const items = await load();
  const titleCount = items.filter(i => i.title).length;
  const colorCount = items.filter(i => i.color_hex).length;
  const nameCount = items.filter(i => i.name_color_hex && (!i.name_color_expires_at || new Date(i.name_color_expires_at) > new Date())).length;

  return (
    <>
      <h1 className="text-xl md:text-2xl font-bold mb-2">Cosmetics</h1>
      <p className="text-pulse-mute mb-4 md:mb-6 text-sm">Who bought what.</p>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 md:gap-4 mb-6 md:mb-8">
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-5">
          <div className="text-xs uppercase text-pulse-mute">Titles owned</div>
          <div className="text-3xl font-bold mt-1">{titleCount}</div>
        </div>
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-5">
          <div className="text-xs uppercase text-pulse-mute">Profile colors</div>
          <div className="text-3xl font-bold mt-1">{colorCount}</div>
        </div>
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-5">
          <div className="text-xs uppercase text-pulse-mute">Name colors (active)</div>
          <div className="text-3xl font-bold mt-1">{nameCount}</div>
        </div>
      </div>

      <div className="bg-pulse-card border border-pulse-border rounded-xl overflow-x-auto -mx-4 md:mx-0 md:rounded-xl">
        <table className="w-full text-sm min-w-[640px]">
          <thead className="bg-pulse-border/40 text-pulse-mute uppercase text-xs">
            <tr>
              <th className="text-left px-4 py-2">Member</th>
              <th className="text-left px-4 py-2">Title</th>
              <th className="text-left px-4 py-2">Profile color</th>
              <th className="text-left px-4 py-2">Name color</th>
              <th className="text-right px-4 py-2">Name color expiry</th>
            </tr>
          </thead>
          <tbody>
            {items.map(c => (
              <tr key={c.discord_id} className="border-t border-pulse-border/50">
                <td className="px-4 py-2 font-mono text-xs">{c.discord_id}</td>
                <td className="px-4 py-2 italic">{c.title ?? <span className="text-pulse-mute">—</span>}</td>
                <td className="px-4 py-2"><Swatch hex={c.color_hex} /></td>
                <td className="px-4 py-2"><Swatch hex={c.name_color_hex} /></td>
                <td className="px-4 py-2 text-right text-xs text-pulse-mute">
                  {c.name_color_expires_at ? new Date(c.name_color_expires_at).toLocaleDateString() : '—'}
                </td>
              </tr>
            ))}
            {items.length === 0 && (
              <tr><td colSpan={5} className="text-center py-6 text-pulse-mute">Nobody has bought any cosmetic yet.</td></tr>
            )}
          </tbody>
        </table>
      </div>
    </>
  );
}
