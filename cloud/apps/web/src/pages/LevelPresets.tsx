import { useState } from 'react';
import { useQuery, useMutation } from 'urql';
import { Plus, Edit2, Trash2, Clock, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button';
import {
  LEVEL_PRESETS_QUERY,
  CREATE_LEVEL_PRESET_MUTATION,
  UPDATE_LEVEL_PRESET_MUTATION,
  DELETE_LEVEL_PRESET_MUTATION,
  type LevelPreset,
  type LevelPresetsQueryData,
} from '../api/operations/level-presets';

const LEVEL_FIELD_LABELS: { key: 'l1' | 'l2' | 'l3' | 'l4' | 'l5'; label: string }[] = [
  { key: 'l1', label: 'Score 1 — weakest' },
  { key: 'l2', label: 'Score 2' },
  { key: 'l3', label: 'Score 3 — mid' },
  { key: 'l4', label: 'Score 4' },
  { key: 'l5', label: 'Score 5 — strongest' },
];

type LevelWords = { l1: string; l2: string; l3: string; l4: string; l5: string };

const EMPTY_LEVEL_WORDS: LevelWords = { l1: '', l2: '', l3: '', l4: '', l5: '' };

export function LevelPresets() {
  const [{ data, fetching, error }, reexecuteQuery] = useQuery<LevelPresetsQueryData>({
    query: LEVEL_PRESETS_QUERY,
  });
  const [, createLevelPreset] = useMutation(CREATE_LEVEL_PRESET_MUTATION);
  const [, updateLevelPreset] = useMutation(UPDATE_LEVEL_PRESET_MUTATION);
  const [, deleteLevelPreset] = useMutation(DELETE_LEVEL_PRESET_MUTATION);

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPreset, setEditingPreset] = useState<LevelPreset | null>(null);

  const [name, setName] = useState('');
  const [levelWords, setLevelWords] = useState<LevelWords>(EMPTY_LEVEL_WORDS);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleOpenCreate = () => {
    setEditingPreset(null);
    setName('');
    setLevelWords(EMPTY_LEVEL_WORDS);
    setIsModalOpen(true);
  };

  const handleOpenEdit = (preset: LevelPreset) => {
    setEditingPreset(preset);
    setName(preset.name);
    setLevelWords({
      l1: preset.latestVersion?.l1 ?? '',
      l2: preset.latestVersion?.l2 ?? '',
      l3: preset.latestVersion?.l3 ?? '',
      l4: preset.latestVersion?.l4 ?? '',
      l5: preset.latestVersion?.l5 ?? '',
    });
    setIsModalOpen(true);
  };

  const handleDelete = async (id: string, presetName: string) => {
    if (!confirm(`Are you sure you want to delete level preset "${presetName}"? This cannot be undone.`)) return;
    await deleteLevelPreset({ id });
    reexecuteQuery({ requestPolicy: 'network-only' });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    try {
      if (editingPreset != null) {
        await updateLevelPreset({
          id: editingPreset.id,
          input: levelWords,
        });
      } else {
        await createLevelPreset({
          input: { name, ...levelWords },
        });
      }
      setIsModalOpen(false);
      reexecuteQuery({ requestPolicy: 'network-only' });
    } catch (err) {
      // eslint-disable-next-line no-console
      console.error(err);
      alert('Failed to save level preset');
    } finally {
      setIsSubmitting(false);
    }
  };

  if (fetching) return <div className="p-8 text-center text-white/50">Loading level presets...</div>;
  if (error) return <div className="p-8 text-center text-red-400">Error loading level presets: {error.message}</div>;

  return (
    <div className="max-w-7xl mx-auto px-4 py-8">
      <div className="flex justify-between items-center mb-8">
        <div>
          <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-teal-200">
            Level Presets
          </h1>
          <p className="text-white/60 mt-1">
            Manage intensity-level word sets for vignette attribute scaling.
            Edits create new versions automatically.
          </p>
        </div>
        <Button
          onClick={handleOpenCreate}
          variant="secondary"
          className="flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          New Level Preset
        </Button>
      </div>

      <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
        {data?.levelPresets.map((preset) => (
          <div
            key={preset.id}
            className="bg-[#1A1A1A] border border-white/10 rounded-xl p-5 hover:border-teal-500/30 transition-colors group"
          >
            <div className="flex justify-between items-start mb-3">
              <h3 className="font-medium text-white group-hover:text-teal-400 transition-colors">
                {preset.name}
              </h3>
              <div className="flex items-center gap-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleOpenEdit(preset)}
                  className="p-1.5 h-auto text-white/40 hover:text-white"
                  title="Edit Level Preset"
                >
                  <Edit2 className="w-4 h-4" />
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => void handleDelete(preset.id, preset.name)}
                  className="p-1.5 h-auto text-white/40 hover:text-red-400 hover:bg-red-400/10"
                  title="Delete Level Preset"
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>

            {preset.latestVersion != null ? (
              <div className="bg-black/30 rounded-lg p-3 mb-4 text-sm text-white/70 font-mono text-xs space-y-1">
                {LEVEL_FIELD_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex gap-2">
                    <span className="text-white/30 w-6 shrink-0">{key.toUpperCase()}</span>
                    <span>{preset.latestVersion![key]}</span>
                    <span className="text-white/20 text-[10px] self-center">{label.split('—')[1]?.trim()}</span>
                  </div>
                ))}
              </div>
            ) : (
              <div className="bg-black/30 rounded-lg p-3 mb-4 min-h-[80px] flex items-center justify-center">
                <span className="italic text-white/30 text-sm">No version yet</span>
              </div>
            )}

            <div className="flex items-center justify-between text-xs text-white/40 border-t border-white/5 pt-3">
              <div className="flex items-center gap-1.5" title="Latest Version">
                <RotateCcw className="w-3 h-3" />
                <span>{preset.latestVersion?.version ?? 'N/A'}</span>
              </div>
              <div className="flex items-center gap-1.5" title="Last Updated">
                <Clock className="w-3 h-3" />
                <span>
                  {new Date(preset.updatedAt).toLocaleString(undefined, {
                    dateStyle: 'medium',
                    timeStyle: 'short',
                  })}
                </span>
              </div>
            </div>
          </div>
        ))}

        {data?.levelPresets.length === 0 && (
          <div className="col-span-3 text-center py-16 text-white/30">
            No level presets yet. Create one to enable 25-condition vignette expansion.
          </div>
        )}
      </div>

      {isModalOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
          <div className="bg-[#1E1E1E] border border-white/10 rounded-xl w-full max-w-lg shadow-2xl">
            <div className="flex justify-between items-center p-6 border-b border-white/10">
              <h2 className="text-xl font-semibold text-white">
                {editingPreset != null ? 'Edit Level Preset' : 'Create Level Preset'}
              </h2>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setIsModalOpen(false)}
                className="text-white/40 hover:text-white"
              >
                ✕
              </Button>
            </div>

            <form onSubmit={(e) => { void handleSubmit(e); }} className="p-6 space-y-4">
              {editingPreset != null && (
                <div className="bg-teal-500/10 border border-teal-500/20 text-teal-300 px-4 py-3 rounded text-sm">
                  Creating a new version. The previous version ({editingPreset.latestVersion?.version}) will remain in history.
                </div>
              )}

              <div>
                <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
                <input
                  type="text"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  disabled={editingPreset != null}
                  className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-teal-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                  placeholder="e.g. Standard"
                  required
                />
                {editingPreset != null && (
                  <p className="text-xs text-white/30 mt-1">Name cannot be changed after creation.</p>
                )}
              </div>

              <div className="space-y-3">
                <label className="block text-sm font-medium text-white/70">
                  Level Words <span className="text-white/30 font-normal">(Score 1 = weakest, Score 5 = strongest)</span>
                </label>
                {LEVEL_FIELD_LABELS.map(({ key, label }) => (
                  <div key={key} className="flex items-center gap-3">
                    <span className="text-xs text-white/40 w-28 shrink-0">{label}</span>
                    <input
                      type="text"
                      value={levelWords[key]}
                      onChange={(e) => setLevelWords((prev) => ({ ...prev, [key]: e.target.value }))}
                      className="flex-1 bg-[#141414] border border-white/10 rounded-lg px-3 py-1.5 text-white text-sm focus:border-teal-500 outline-none"
                      placeholder={key === 'l1' ? 'e.g. negligible' : key === 'l3' ? 'e.g. moderate' : key === 'l5' ? 'e.g. full' : ''}
                      required
                    />
                  </div>
                ))}
              </div>

              <div className="flex justify-end gap-3 pt-4">
                <Button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  variant="ghost"
                >
                  Cancel
                </Button>
                <Button
                  type="submit"
                  disabled={isSubmitting}
                  variant="primary"
                  isLoading={isSubmitting}
                >
                  {isSubmitting ? 'Saving...' : 'Save Preset'}
                </Button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
