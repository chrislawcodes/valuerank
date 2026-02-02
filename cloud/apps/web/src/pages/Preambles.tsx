import { useState } from 'react';
import { useQuery, useMutation } from 'urql';
import { Plus, Edit2, Trash2, Clock, RotateCcw } from 'lucide-react';
import { Button } from '../components/ui/Button';

const PREAMBLES_QUERY = `
  query GetPreambles {
    preambles {
      id
      name
      updatedAt
      latestVersion {
        id
        version
        content
        createdAt
      }
    }
  }
`;

const CREATE_PREAMBLE_MUTATION = `
  mutation CreatePreamble($input: CreatePreambleInput!) {
    createPreamble(input: $input) {
      id
      name
      latestVersion {
        content
      }
    }
  }
`;

const UPDATE_PREAMBLE_MUTATION = `
  mutation UpdatePreamble($id: ID!, $input: UpdatePreambleInput!) {
    updatePreamble(id: $id, input: $input) {
      id
      name
      updatedAt
      latestVersion {
        version
        content
      }
    }
  }
`;

const DELETE_PREAMBLE_MUTATION = `
  mutation DeletePreamble($id: ID!) {
    deletePreamble(id: $id) {
      id
    }
  }
`;

type Preamble = {
    id: string;
    name: string;
    updatedAt: string;
    latestVersion: {
        id: string;
        version: string;
        content: string;
        createdAt: string;
    } | null;
};

type PreambleQueryData = {
    preambles: Preamble[];
};

export function Preambles() {
    const [{ data, fetching, error }, reexecuteQuery] = useQuery<PreambleQueryData>({ query: PREAMBLES_QUERY });
    const [, createPreamble] = useMutation(CREATE_PREAMBLE_MUTATION);
    const [, updatePreamble] = useMutation(UPDATE_PREAMBLE_MUTATION);
    const [, deletePreamble] = useMutation(DELETE_PREAMBLE_MUTATION);

    const [isModalOpen, setIsModalOpen] = useState(false);
    const [editingPreamble, setEditingPreamble] = useState<Preamble | null>(null);

    // Form State
    const [name, setName] = useState('');
    const [content, setContent] = useState('');
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleOpenCreate = () => {
        setEditingPreamble(null);
        setName('');
        setContent('');
        setIsModalOpen(true);
    };

    const handleOpenEdit = (preamble: Preamble) => {
        setEditingPreamble(preamble);
        setName(preamble.name);
        setContent(preamble.latestVersion?.content || '');
        setIsModalOpen(true);
    };

    const handleDelete = async (id: string, name: string) => {
        if (!confirm(`Are you sure you want to delete preamble "${name}"? This cannot be undone.`)) return;
        await deletePreamble({ id });
        reexecuteQuery({ requestPolicy: 'network-only' });
    };

    const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setIsSubmitting(true);

        try {
            if (editingPreamble) {
                await updatePreamble({
                    id: editingPreamble.id,
                    input: { content }
                });
            } else {
                await createPreamble({
                    input: { name, content }
                });
            }
            setIsModalOpen(false);
            reexecuteQuery({ requestPolicy: 'network-only' });
        } catch (err) {
            // eslint-disable-next-line no-console
            console.error(err);
            alert('Failed to save preamble');
        } finally {
            setIsSubmitting(false);
        }
    };

    if (fetching) return <div className="p-8 text-center text-white/50">Loading preambles...</div>;
    if (error) return <div className="p-8 text-center text-red-400">Error loading preambles: {error.message}</div>;

    return (
        <div className="max-w-7xl mx-auto px-4 py-8">
            <div className="flex justify-between items-center mb-8">
                <div>
                    <h1 className="text-2xl font-bold bg-clip-text text-transparent bg-gradient-to-r from-teal-400 to-teal-200">
                        System Preambles
                    </h1>
                    <p className="text-white/60 mt-1">
                        Manage reusable system instructions for Vignettes.
                        Edits create new versions automatically.
                    </p>
                </div>
                <Button
                    onClick={handleOpenCreate}
                    variant="secondary"
                    className="flex items-center gap-2"
                >
                    <Plus className="w-4 h-4" />
                    New Preamble
                </Button>
            </div>

            <div className="grid gap-4 grid-cols-1 md:grid-cols-2 lg:grid-cols-3">
                {/* Default Empty Preamble Card (Informational) */}
                <div className="bg-[#1A1A1A] border border-white/5 rounded-xl p-5 opacity-60">
                    <div className="flex justify-between items-start mb-3">
                        <h3 className="font-medium text-white/80">Default (Empty)</h3>
                        <span className="px-2 py-0.5 rounded text-xs bg-gray-800 text-gray-400 border border-gray-700">
                            System
                        </span>
                    </div>
                    <p className="text-sm text-white/40 mb-4 line-clamp-3 italic">
                        (No preamble applied)
                    </p>
                </div>

                {data?.preambles.map((preamble) => (
                    <div key={preamble.id} className="bg-[#1A1A1A] border border-white/10 rounded-xl p-5 hover:border-teal-500/30 transition-colors group">
                        <div className="flex justify-between items-start mb-3">
                            <h3 className="font-medium text-white group-hover:text-teal-400 transition-colors">
                                {preamble.name}
                            </h3>
                            <div className="flex items-center gap-2">
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleOpenEdit(preamble)}
                                    className="p-1.5 h-auto text-white/40 hover:text-white"
                                    title="Edit Preamble"
                                >
                                    <Edit2 className="w-4 h-4" />
                                </Button>
                                <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => handleDelete(preamble.id, preamble.name)}
                                    className="p-1.5 h-auto text-white/40 hover:text-red-400 hover:bg-red-400/10"
                                    title="Delete Preamble"
                                >
                                    <Trash2 className="w-4 h-4" />
                                </Button>
                            </div>
                        </div>

                        <div className="bg-black/30 rounded-lg p-3 mb-4 min-h-[80px] text-sm text-white/70 font-mono text-xs">
                            {preamble.latestVersion?.content ? (
                                <div className="line-clamp-3">{preamble.latestVersion.content}</div>
                            ) : (
                                <span className="italic text-white/30">No content</span>
                            )}
                        </div>

                        <div className="flex items-center justify-between text-xs text-white/40 border-t border-white/5 pt-3">
                            <div className="flex items-center gap-1.5" title="Latest Version">
                                <RotateCcw className="w-3 h-3" />
                                <span>{preamble.latestVersion?.version || 'N/A'}</span>
                            </div>
                            <div className="flex items-center gap-1.5" title="Last Updated">
                                <Clock className="w-3 h-3" />
                                <span>{new Date(preamble.updatedAt).toLocaleString(undefined, { dateStyle: 'medium', timeStyle: 'short' })}</span>
                            </div>
                        </div>
                    </div>
                ))}
            </div>

            {/* Modal */}
            {isModalOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-sm">
                    <div className="bg-[#1E1E1E] border border-white/10 rounded-xl w-full max-w-2xl shadow-2xl">
                        <div className="flex justify-between items-center p-6 border-b border-white/10">
                            <h2 className="text-xl font-semibold text-white">
                                {editingPreamble ? 'Edit Preamble' : 'Create Preamble'}
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

                        <form onSubmit={handleSubmit} className="p-6 space-y-4">
                            {editingPreamble && (
                                <div className="bg-teal-500/10 border border-teal-500/20 text-teal-300 px-4 py-3 rounded text-sm mb-4">
                                    Creating a new version. The previous version ({editingPreamble.latestVersion?.version}) will remain in history.
                                </div>
                            )}

                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Name</label>
                                <input
                                    type="text"
                                    value={name}
                                    onChange={(e) => setName(e.target.value)}
                                    disabled={!!editingPreamble} // Name is immutable (for now, or editable?)
                                    // Requirements didn't specify name immutability, but usually name identifies the preamble entity.
                                    // I'll make it immutable to simplify identity.
                                    className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white focus:border-teal-500 outline-none disabled:opacity-50 disabled:cursor-not-allowed"
                                    placeholder="e.g. Standard Safety Preamble"
                                    required
                                />
                                {editingPreamble && <p className="text-xs text-white/30 mt-1">Name cannot be changed after creation.</p>}
                            </div>

                            <div>
                                <label className="block text-sm font-medium text-white/70 mb-1">Content</label>
                                <textarea
                                    value={content}
                                    onChange={(e) => setContent(e.target.value)}
                                    className="w-full bg-[#141414] border border-white/10 rounded-lg px-3 py-2 text-white font-mono text-sm focus:border-teal-500 outline-none min-h-[200px]"
                                    placeholder="Enter preamble instructions..."
                                    required
                                />
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
                                    {isSubmitting ? 'Saving...' : 'Save Preamble'}
                                </Button>
                            </div>
                        </form>
                    </div>
                </div>
            )}
        </div>
    );
}
