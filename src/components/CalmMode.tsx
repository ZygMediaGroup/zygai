import React, { useMemo, useRef, useState } from 'react';
import { SendHorizontal, Trash2, PlayCircle, PauseCircle } from 'lucide-react';
import MessageBubble from '@/components/MessageBubble';
import { AppSettings, Message } from '@/types';
import clsx from 'clsx';
import { API_BASE } from '@/utils/apiBase';

const CALM_TRACKS = [
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_10_-_Tone_Poetry_E52E62AA-6353-44AE-BA40-2AE6AD7F1776.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_11_-_The_Healing_Lake_8BE609A8-7115-4273-8A1A-CE5738459E7A.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_12_-_It_Was_Beautiful_A8151772-9133-4709-8419-D74050521F15.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_13_-_Introverted_Chords_AAA9721C-0CAE-470A-A2CE-A8E1B627463C.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_14_-_Absolvo_6C9066FC-B86B-4525-A504-62E7EC98DF73.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_15_-_Painting_Twilight_B95718A4-8D99-474C-9B6B-07EC2087E161.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_16_-_Star_Encounter_F14A4860-06AC-4C42-BB1B-E1E6B92152C5.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_17_-_Day_and_Night_9620FEF5-BD45-4570-9B97-1DEF9F245C72.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_18_-_Before_Sunset_622D0F46-D1E8-44BE-AA22-B85E311A62BF.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_19_20_-_Ascension_Guest_Mix_on_AmbientMusicGuide.com.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_1_-_Still_Habitat.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_21_-_Heaven_Sings.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_22_-_Beauty_In_Decay.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_23_-_Unabridged_Rest.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_24_-_Quarantine.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_25_-_Guest_Mix_on_Planetarium.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_26_-_Slow_Drifter.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_27_-_Refracted_World.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_28_-_Stream_of_Thought.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_29_-_4_Years.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_2_-_Slowly_Dusk.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_30_-_Seclusion.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_31_-_Drowning_Last_Light.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_32_-_As_The_World_Comes_Into_Focus.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_33_-_Stasis.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_34_-_Spherule_-_Guest_Mix_on_Ambient_Soundbath.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_35_-_Deathless_Slumber_Guest_Mix_on_Corsica_One.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_36_-_One.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_37_-_Tomorrows_Lights.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_38_-_Weightless.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_39_-_Awakened_Souls.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_3_-_Lullaby_for_Grownups_462868CD-0AE8-469D-B460-63696B597AF7.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_40_-_An_Ocean_Of_Stars_-_Guest_Mix_by_Tonepoet.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_41_-_Remember_Me.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_42_-_Suspended_Memories.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_43_-_Place_to_Rest_My_Head.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_44_-_Into_the_Dream.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_45_-_Sense_of_Idle.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_46_-_Morning_Dew.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_47_-_Evanesce.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_48_-_Chaka_Meditation.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_49_-_Aloft.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_4_-_The_Safest_Place_E7398A89-465A-46D4-AC1F-4D9A2015DEE1.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_50_-_Harmony.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_51_-_Moon_Shadows.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_52_-_Way_Back_When.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_53_-_We_Have_Been_Here_Before.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_54_-_Rebirth.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_55_-_Letting_Go.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_56_-_Quiet_Peace.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_57_-_The_Artist.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_58_-_Ethni-City.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_59_-_Chance_for_Splendor.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_5_-_Clair_de_Lune_842A6E32-AE71-4A74-A25C-A31E75E7DF7B.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_60_-_Ember.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_61_-_Return_to_Eden.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_62_-_All_That_Blooms_Must_Fall.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_63_-_Falling_Up.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_64_-_Ballad_of_Dreamland.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_65_-_Forty.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_66_-_Glimmer_in_the_Dark.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_67_-_Dear_Gravity.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_68_-_Le_Code.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_69_-_The_Traveller.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_6_-_Fragments_of_Memories_671ECAFE-0255-4DAE-9F78-055B40DF65A4.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_70_-_Signed_I_Wish_You_Well.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_71_-_Station_of_Contentment.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_72_-_Human_Is_Alive.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_73_-_Imaginary_North.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_74_-_What_If.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_75_-_Primordial_Goodness.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_76_-_Serenade_for_Celestial_Departures.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_77_-_Antarctic_Wastelands.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_78_-_Echoes_in_the_Valley.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_79_-_Exposition_of_the_Heart.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_7_-_Dreams_from_the_Sea_8FE92CA4-D82C-4564-A85C-48807DA36EFE.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_80_-_Drop_in_the_Ocean.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_81_-_Perfectly_Designed_Puzzle.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_82_-_Inner_Luminescence.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_8_-_Peaceful_Moments_471CF124-5255-4D81-9243-5D7DE89702AD.mp3',
  'https://archive.org/download/CalmPills/Uplifting_Pills_-_Calm_Pill_9_-_Beacon_2AD2E9EA-F213-4751-B6E7-0FCD427DABC4.mp3'
];

const formatNowPlaying = (url: string) => {
  const fileName = decodeURIComponent(url.split('/').pop() || '');
  const baseName = fileName.replace(/\.mp3$/i, '');
  const cleanName = baseName.replace(/_[A-F0-9-]{8,}$/i, '');
  const parts = cleanName.split('_-_').map((part) => part.replace(/_/g, ' ').trim());
  const song = parts[0] || 'Uplifting Pills';
  const extra = parts.slice(1).filter(Boolean).join(' · ');
  return `Chill Pill — ${song}${extra ? ` (${extra})` : ''}`;
};

const createId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : `id-${Date.now()}-${Math.random().toString(16).slice(2)}`;

interface CalmModeProps {
  settings: AppSettings;
  displayName?: string | null;
}

const CalmMode: React.FC<CalmModeProps> = ({ settings, displayName }) => {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [audioSrc, setAudioSrc] = useState<string | null>(null);
  const [audioLoading, setAudioLoading] = useState(false);
  const [audioError, setAudioError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nowPlaying, setNowPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const greeting = useMemo(() => {
    const hour = new Date().getHours();
    if (hour < 12) return 'Good morning';
    if (hour < 18) return 'Good afternoon';
    return 'Good evening';
  }, []);

  const sendMessage = async () => {
    if (!input.trim() || sending) return;
    setError(null);
    const userMessage: Message = {
      id: createId(),
      role: 'user',
      content: input.trim(),
      createdAt: new Date().toISOString()
    };
    const nextMessages = [...messages, userMessage];
    setMessages(nextMessages);
    setInput('');
    setSending(true);
    try {
      const token = localStorage.getItem('zygai:token');
      const response = await fetch(`${API_BASE}/calm`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { Authorization: `Bearer ${token}` } : {})
        },
        body: JSON.stringify({
          messages: nextMessages.map((message) => ({
            role: message.role,
            content: message.content
          })),
          settings
        })
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(data?.error || 'Calm Mode failed.');
      }
      const cleanContent = (data.message || '')
        .replace(/<environment_details>[\s\S]*?<\/environment_details>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      const aiMessage: Message = {
        id: createId(),
        role: 'assistant',
        content: cleanContent,
        createdAt: new Date().toISOString()
      };
      setMessages((prev) => [...prev, aiMessage]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Calm Mode failed.');
    } finally {
      setSending(false);
    }
  };

  const toggleAmbient = async () => {
    setAudioError(null);
    if (isPlaying && audioRef.current) {
      audioRef.current.pause();
      setIsPlaying(false);
      return;
    }
    if (!audioSrc) {
      setAudioLoading(true);
      try {
        const src = CALM_TRACKS[0];
        setAudioSrc(src);
        setNowPlaying(formatNowPlaying(src));
      } catch (err) {
        setAudioError(err instanceof Error ? err.message : 'Failed to load ambient audio.');
        setAudioLoading(false);
        return;
      }
      setAudioLoading(false);
    }
    if (audioRef.current) {
      try {
        await audioRef.current.play();
        setIsPlaying(true);
      } catch (err) {
        setAudioError(err instanceof Error ? err.message : 'Playback failed.');
      }
    }
  };

  return (
    <section className="flex h-full flex-1 flex-col">
      <div className="flex flex-col gap-4 border-b border-ink-100 bg-white/70 px-4 py-4 backdrop-blur sm:px-6 sm:py-5 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="font-display text-xl font-semibold sm:text-2xl">Calm Mode</h1>
            <p className="text-xs text-ink-500 sm:text-sm dark:text-ink-100">
              A private space to write things out. Calm Mode chats are not saved.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <button
              onClick={toggleAmbient}
              disabled={audioLoading}
              className="flex items-center gap-2 rounded-full border border-ink-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-600 transition hover:border-saffron-400 hover:text-saffron-500 disabled:cursor-not-allowed disabled:text-ink-400 dark:border-ink-700 dark:text-ink-200"
            >
              {isPlaying ? <PauseCircle size={14} /> : <PlayCircle size={14} />}
              {audioLoading ? 'Loading' : isPlaying ? 'Pause' : 'Play'}
            </button>
            {nowPlaying && (
              <span className="text-[10px] uppercase tracking-[0.2em] text-ink-400 dark:text-ink-200">
                Now playing: {nowPlaying}
              </span>
            )}
            <button
              onClick={() => setMessages([])}
              className="flex items-center gap-2 rounded-full border border-ink-200 px-3 py-2 text-[10px] font-semibold uppercase tracking-[0.2em] text-ink-600 transition hover:border-saffron-400 hover:text-saffron-500 dark:border-ink-700 dark:text-ink-200"
            >
              <Trash2 size={14} />
              Delete chat
            </button>
          </div>
        </div>
        <p className="text-[11px] text-ink-400 sm:text-xs dark:text-ink-200">
          Calm Audio provided by Internet Archive.
        </p>
        {audioError && (
          <div className="rounded-xl border border-red-200 bg-red-50 p-3 text-xs text-red-600">
            {audioError}
          </div>
        )}
      </div>

      {audioSrc && (
        <audio
          ref={audioRef}
          src={audioSrc}
          onEnded={() => setIsPlaying(false)}
          onPause={() => setIsPlaying(false)}
        />
      )}

      <div className="chat-gradient flex-1 overflow-y-auto px-4 py-5 sm:px-6 sm:py-6">
        <div className="flex flex-col gap-6">
          {messages.length === 0 && (
            <div className="rounded-2xl border border-ink-200 bg-white/80 p-4 text-sm text-ink-700 shadow-sm dark:border-ink-700 dark:bg-ink-900 dark:text-ink-100">
              <p className="font-semibold">
                {greeting}
                {displayName ? `, ${displayName}` : ''} — what can I help you with?
              </p>
            </div>
          )}
          {messages.map((messageItem) => (
            <MessageBubble
              key={messageItem.id}
              message={messageItem}
              onDelete={() =>
                setMessages((prev) => prev.filter((message) => message.id !== messageItem.id))
              }
              onEdit={(content) =>
                setMessages((prev) =>
                  prev.map((message) =>
                    message.id === messageItem.id
                      ? { ...message, content, edited: true }
                      : message
                  )
                )
              }
            />
          ))}
          {error && (
            <div className="flex items-center gap-2 rounded-xl border border-red-200 bg-red-50 p-3 text-sm text-red-600">
              {error}
            </div>
          )}
        </div>
      </div>

      <div className="border-t border-ink-100 bg-white/90 px-4 py-4 sm:px-6 sm:py-4 dark:border-ink-800 dark:bg-ink-900">
        <div className="flex items-end gap-2 sm:gap-3">
          <textarea
            value={input}
            onChange={(event) => setInput(event.target.value)}
            placeholder="Write what’s on your mind..."
            className="min-h-[64px] flex-1 resize-none rounded-2xl border border-ink-200 bg-white/80 p-3 text-sm text-ink-900 shadow-sm outline-none transition focus:border-saffron-400 sm:min-h-[72px] sm:p-4 dark:border-ink-700 dark:bg-ink-800/85 dark:text-ink-50"
          />
          <button
            onClick={sendMessage}
            disabled={sending}
            className={clsx(
              'flex h-11 items-center gap-2 rounded-2xl px-4 text-xs font-semibold transition sm:h-12 sm:px-5 sm:text-sm',
              sending
                ? 'cursor-not-allowed bg-ink-200 text-ink-500 dark:bg-ink-700 dark:text-ink-100'
                : 'bg-saffron-400 text-ink-900 hover:bg-saffron-300'
            )}
          >
            <span className="hidden sm:inline">Send</span>
            <SendHorizontal size={16} />
          </button>
        </div>
      </div>
    </section>
  );
};

export default CalmMode;
