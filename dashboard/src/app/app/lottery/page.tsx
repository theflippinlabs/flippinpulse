import Link from 'next/link';
import { getSession } from '@/lib/auth';
import { redirect } from 'next/navigation';
import { supabase } from '@/lib/supabase';
import { getBalance } from '@/lib/play';
import { t } from '@/lib/i18n';
import LotteryClient from './LotteryClient';

export const dynamic = 'force-dynamic';

async function loadRound(discordId: string) {
  const { data: round } = await supabase
    .from('lottery_rounds')
    .select('id, ticket_price, pot_pulse, total_tickets, draw_at, status')
    .eq('status', 'active')
    .maybeSingle();
  const r = (round as { id: string; ticket_price: number; pot_pulse: number; total_tickets: number; draw_at: string | null; status: string } | null) ?? null;

  let myTickets = 0;
  if (r) {
    const { data } = await supabase
      .from('lottery_tickets').select('tickets').eq('round_id', r.id).eq('discord_id', discordId).maybeSingle();
    myTickets = (data as { tickets?: number } | null)?.tickets ?? 0;
  }
  return { round: r, myTickets };
}

const fmt = (n: number) => n.toLocaleString('en-US');

export default async function LotteryPage() {
  const session = getSession();
  if (!session) redirect('/');
  const [balance, { round, myTickets }] = await Promise.all([
    getBalance(session.id),
    loadRound(session.id),
  ]);

  return (
    <>
      <Link href="/app" className="inline-flex items-center gap-1 text-sm text-pulse-mute hover:text-pulse-gold mb-3">
        <span className="text-lg leading-none">‹</span>
        <span>{t('common.back')}</span>
      </Link>
      <h1 className="text-2xl font-bold mb-1">🎫 {t('lottery.title')}</h1>
      <p className="text-pulse-mute text-sm mb-4">{t('lottery.subtitle')}</p>

      {!round ? (
        <div className="bg-pulse-card border border-pulse-border rounded-xl p-6 text-center">
          <div className="text-4xl mb-2">🎫</div>
          <div className="font-semibold">{t('lottery.no_round_title')}</div>
          <div className="text-sm text-pulse-mute mt-1">{t('lottery.no_round_hint')}</div>
        </div>
      ) : (
        <>
          <div className="bg-gradient-to-br from-pulse-gold/25 to-pulse-gold/5 border border-pulse-gold/40 rounded-2xl p-5 mb-4 text-center relative overflow-hidden">
            <div className="absolute inset-0 bg-card-glow opacity-40 pointer-events-none" />
            <div className="relative">
              <div className="text-xs uppercase text-pulse-mute tracking-wide">{t('lottery.pot_label')}</div>
              <div className="text-5xl font-bold text-pulse-gold my-2">{fmt(round.pot_pulse)}</div>
              <div className="text-xs text-pulse-mute">
                PULSE · {round.total_tickets} {round.total_tickets > 1 ? t('lottery.tickets_sold_plural') : t('lottery.tickets_sold')}
              </div>
              {round.draw_at && (
                <div className="text-xs text-pulse-mute mt-2">{t('lottery.draw')} : {new Date(round.draw_at).toLocaleString()}</div>
              )}
            </div>
          </div>

          <div className="bg-pulse-card border border-pulse-border rounded-xl p-4 mb-4 grid grid-cols-2 gap-3">
            <div>
              <div className="text-xs uppercase text-pulse-mute">{t('lottery.price_per_ticket')}</div>
              <div className="text-xl font-bold text-pulse-gold mt-1">{fmt(round.ticket_price)} PULSE</div>
            </div>
            <div>
              <div className="text-xs uppercase text-pulse-mute">{t('lottery.your_tickets')}</div>
              <div className="text-xl font-bold text-pulse-text mt-1">
                {myTickets}
                {round.total_tickets > 0 && (
                  <span className="text-xs text-pulse-mute ml-1">
                    ({((myTickets / round.total_tickets) * 100).toFixed(1)}%)
                  </span>
                )}
              </div>
            </div>
          </div>

          <LotteryClient
            ticketPrice={round.ticket_price}
            initialBalance={balance}
            initialMyTickets={myTickets}
            initialPot={round.pot_pulse}
            initialTotalTickets={round.total_tickets}
          />
        </>
      )}
    </>
  );
}
