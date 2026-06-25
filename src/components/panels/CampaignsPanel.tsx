import React, { useState, useEffect } from 'react';
import { Plus, Edit2, Trash2, Save, Send } from 'lucide-react';

type Campaign = {
  id?: string;
  name: string;
  description: string;
  featureKey: string;
  durationDays: number;
  quotaLimit: number;
  isActive: boolean;
};

type CampaignsPanelProps = {
  token: string;
  onShowToast: (message: string, type?: 'success' | 'error') => void;
};

export const CampaignsPanel: React.FC<CampaignsPanelProps> = ({ token, onShowToast }) => {
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [userEmail, setUserEmail] = useState('');
  const [selectedCampaignId, setSelectedCampaignId] = useState('');
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editingCampaign, setEditingCampaign] = useState<Campaign | null>(null);
  const [assigning, setAssigning] = useState(false);

  const featureOptions = [
    { value: 'chat', label: 'Chat Messages' },
    { value: 'image_generation', label: 'Image Generation' },
    { value: 'vibe_coder', label: 'Vibe Coder' }
  ];

  const fetchCampaigns = async () => {
    setLoading(true);
    try {
      const response = await fetch('/api/admin/campaigns', {
        headers: { Authorization: `Bearer ${token}` }
      });
      if (response.ok) {
        const data = await response.json();
        setCampaigns(data.campaigns || []);
      } else {
        onShowToast('Failed to fetch campaigns', 'error');
      }
    } catch (error) {
      onShowToast('Error fetching campaigns', 'error');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchCampaigns();
  }, []);

  const handleSaveCampaigns = async () => {
    setSaving(true);
    try {
      const response = await fetch('/api/admin/campaigns', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ campaigns })
      });
      
      if (response.ok) {
        onShowToast('Campaigns saved successfully', 'success');
        fetchCampaigns();
      } else {
        onShowToast('Failed to save campaigns', 'error');
      }
    } catch (error) {
      onShowToast('Error saving campaigns', 'error');
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteCampaign = async (id: string) => {
    if (!window.confirm('Are you sure you want to delete this campaign?')) return;
    
    try {
      const response = await fetch(`/api/admin/campaigns/${id}`, {
        method: 'DELETE',
        headers: { Authorization: `Bearer ${token}` }
      });
      
      if (response.ok) {
        onShowToast('Campaign deleted successfully', 'success');
        fetchCampaigns();
      } else {
        onShowToast('Failed to delete campaign', 'error');
      }
    } catch (error) {
      onShowToast('Error deleting campaign', 'error');
    }
  };

  const handleAssignCampaign = async () => {
    if (!selectedCampaignId || !userEmail) {
      onShowToast('Please select a campaign and enter a user email', 'error');
      return;
    }
    
    setAssigning(true);
    try {
      const response = await fetch(`/api/admin/campaigns/${selectedCampaignId}/assign`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${token}`
        },
        body: JSON.stringify({ userEmail })
      });
      
      if (response.ok) {
        onShowToast('Campaign assigned successfully', 'success');
        setUserEmail('');
        setSelectedCampaignId('');
      } else {
        const data = await response.json();
        onShowToast(data.error || 'Failed to assign campaign', 'error');
      }
    } catch (error) {
      onShowToast('Error assigning campaign', 'error');
    } finally {
      setAssigning(false);
    }
  };

  const handleAddCampaign = () => {
    setEditingCampaign({
      name: '',
      description: '',
      featureKey: 'chat',
      durationDays: 30,
      quotaLimit: 100,
      isActive: true
    });
  };

  const handleEditCampaign = (campaign: Campaign) => {
    setEditingCampaign({ ...campaign });
  };

  const handleSaveCampaign = () => {
    if (!editingCampaign) return;
    
    if (editingCampaign.id) {
      // Update existing campaign
      setCampaigns(campaigns.map(c => c.id === editingCampaign.id ? editingCampaign : c));
    } else {
      // Add new campaign
      setCampaigns([...campaigns, { ...editingCampaign, id: Date.now().toString() }]);
    }
    
    setEditingCampaign(null);
  };

  const handleCancelEdit = () => {
    setEditingCampaign(null);
  };

  return (
    <div className="space-y-6">
      <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Campaign Assignment</h3>
        </div>
        
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
          <div>
            <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">Select Campaign</label>
            <select
              value={selectedCampaignId}
              onChange={(e) => setSelectedCampaignId(e.target.value)}
              className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
            >
              <option value="">Choose a campaign</option>
              {campaigns.filter(c => c.isActive).map(campaign => (
                <option key={campaign.id} value={campaign.id}>
                  {campaign.name} ({featureOptions.find(f => f.value === campaign.featureKey)?.label})
                </option>
              ))}
            </select>
          </div>
          
          <div>
            <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">User Email</label>
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="user@example.com"
              className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
            />
          </div>
          
          <div className="flex items-end">
            <button
              onClick={handleAssignCampaign}
              disabled={assigning || !selectedCampaignId || !userEmail}
              className="flex items-center gap-2 rounded-lg bg-saffron-500 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
            >
              {assigning ? (
                <>
                  <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                  Assigning...
                </>
              ) : (
                <>
                  <Send size={16} />
                  Assign Campaign
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      <section className="rounded-2xl border border-ink-100 dark:border-ink-800 bg-white dark:bg-ink-900 p-6 shadow-sm">
        <div className="flex items-center justify-between mb-6">
          <h3 className="text-sm font-bold uppercase tracking-widest text-ink-900 dark:text-ink-50">Campaigns</h3>
          <button
            onClick={handleAddCampaign}
            className="flex items-center gap-2 rounded-lg bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
          >
            <Plus size={16} />
            Add Campaign
          </button>
        </div>

        {editingCampaign ? (
          <div className="rounded-xl border border-ink-100 dark:border-ink-800 p-4 mb-6">
            <h4 className="text-sm font-bold text-ink-900 dark:text-ink-50 mb-4">
              {editingCampaign.id ? 'Edit Campaign' : 'Add New Campaign'}
            </h4>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">Name</label>
                <input
                  type="text"
                  value={editingCampaign.name}
                  onChange={(e) => setEditingCampaign({...editingCampaign, name: e.target.value})}
                  className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">Feature</label>
                <select
                  value={editingCampaign.featureKey}
                  onChange={(e) => setEditingCampaign({...editingCampaign, featureKey: e.target.value})}
                  className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
                >
                  {featureOptions.map(option => (
                    <option key={option.value} value={option.value}>{option.label}</option>
                  ))}
                </select>
              </div>
              
              <div>
                <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">Duration (days)</label>
                <input
                  type="number"
                  min="1"
                  value={editingCampaign.durationDays}
                  onChange={(e) => setEditingCampaign({...editingCampaign, durationDays: parseInt(e.target.value) || 1})}
                  className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
                />
              </div>
              
              <div>
                <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">Quota Limit</label>
                <input
                  type="number"
                  min="1"
                  value={editingCampaign.quotaLimit}
                  onChange={(e) => setEditingCampaign({...editingCampaign, quotaLimit: parseInt(e.target.value) || 1})}
                  className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
                />
              </div>
              
              <div className="md:col-span-2">
                <label className="block text-xs font-bold text-ink-700 dark:text-ink-300 mb-2">Description</label>
                <textarea
                  value={editingCampaign.description}
                  onChange={(e) => setEditingCampaign({...editingCampaign, description: e.target.value})}
                  rows={3}
                  className="w-full rounded-lg border border-ink-200 dark:border-ink-700 bg-white dark:bg-ink-800 px-3 py-2 text-sm text-ink-900 dark:text-ink-100 focus:outline-none focus:ring-2 focus:ring-saffron-500"
                />
              </div>
            </div>
            
            <div className="flex items-center justify-between">
              <label className="flex items-center gap-2">
                <input
                  type="checkbox"
                  checked={editingCampaign.isActive}
                  onChange={(e) => setEditingCampaign({...editingCampaign, isActive: e.target.checked})}
                  className="rounded border-ink-300 text-saffron-500 focus:ring-saffron-500"
                />
                <span className="text-sm text-ink-700 dark:text-ink-300">Active</span>
              </label>
              
              <div className="flex gap-2">
                <button
                  onClick={handleCancelEdit}
                  className="rounded-lg border border-ink-200 dark:border-ink-700 px-4 py-2 text-sm font-bold text-ink-700 dark:text-ink-300 transition hover:bg-ink-50 dark:hover:bg-ink-800"
                >
                  Cancel
                </button>
                <button
                  onClick={handleSaveCampaign}
                  className="rounded-lg bg-saffron-500 px-4 py-2 text-sm font-bold text-white transition hover:opacity-90"
                >
                  Save
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {loading ? (
          <div className="flex justify-center py-8">
            <div className="h-6 w-6 animate-spin rounded-full border-2 border-saffron-500 border-t-transparent" />
          </div>
        ) : (
          <div className="overflow-hidden rounded-xl border border-ink-100 dark:border-ink-800">
            {campaigns.length === 0 ? (
              <div className="p-8 text-center">
                <p className="text-ink-500 dark:text-ink-400">No campaigns found</p>
              </div>
            ) : (
              <table className="w-full text-left text-sm">
                <thead className="border-b border-ink-100 dark:border-ink-800 bg-ink-50 dark:bg-ink-800/50 text-ink-500 dark:text-ink-400">
                  <tr>
                    <th className="px-4 py-3 font-medium">Name</th>
                    <th className="px-4 py-3 font-medium">Feature</th>
                    <th className="px-4 py-3 font-medium">Duration</th>
                    <th className="px-4 py-3 font-medium">Quota</th>
                    <th className="px-4 py-3 font-medium">Status</th>
                    <th className="px-4 py-3 font-medium">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-ink-100 dark:divide-ink-800">
                  {campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-ink-50 dark:hover:bg-ink-800/30">
                      <td className="px-4 py-3 font-medium text-ink-900 dark:text-ink-100">
                        {campaign.name}
                        {campaign.description && (
                          <div className="text-xs text-ink-500 dark:text-ink-400 mt-1">
                            {campaign.description}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-ink-700 dark:text-ink-300">
                        {featureOptions.find(f => f.value === campaign.featureKey)?.label || campaign.featureKey}
                      </td>
                      <td className="px-4 py-3 text-ink-700 dark:text-ink-300">
                        {campaign.durationDays} days
                      </td>
                      <td className="px-4 py-3 text-ink-700 dark:text-ink-300">
                        {campaign.quotaLimit}
                      </td>
                      <td className="px-4 py-3">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          campaign.isActive 
                            ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-900/30 dark:text-emerald-300' 
                            : 'bg-ink-100 text-ink-800 dark:bg-ink-800 dark:text-ink-300'
                        }`}>
                          {campaign.isActive ? 'Active' : 'Inactive'}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => handleEditCampaign(campaign)}
                            className="rounded p-1.5 text-ink-500 hover:bg-ink-100 hover:text-ink-700 dark:text-ink-400 dark:hover:bg-ink-800 dark:hover:text-ink-200"
                          >
                            <Edit2 size={16} />
                          </button>
                          <button
                            onClick={() => campaign.id && handleDeleteCampaign(campaign.id)}
                            className="rounded p-1.5 text-ink-500 hover:bg-red-50 hover:text-red-700 dark:text-ink-400 dark:hover:bg-red-900/30 dark:hover:text-red-300"
                          >
                            <Trash2 size={16} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        <div className="mt-6 flex justify-end">
          <button
            onClick={handleSaveCampaigns}
            disabled={saving}
            className="flex items-center gap-2 rounded-lg bg-ink-900 dark:bg-ink-50 dark:text-ink-900 px-6 py-2.5 text-sm font-bold text-white transition hover:opacity-90 disabled:opacity-50"
          >
            {saving ? (
              <>
                <div className="h-4 w-4 animate-spin rounded-full border-2 border-white border-t-transparent" />
                Saving...
              </>
            ) : (
              <>
                <Save size={16} />
                Save All Changes
              </>
            )}
          </button>
        </div>
      </section>
    </div>
  );
};