import { useState } from 'react';
import { useAuth } from '../../auth/hooks';
import { Button } from '../ui/Button';
import { Card, CardHeader, CardContent } from '../ui/Card';
import { Input } from '../ui/Input';
import { AlertCircle, CheckCircle } from 'lucide-react';

export function AccountPanel() {
    const { user, token, logout } = useAuth();

    const [profileName, setProfileName] = useState(user?.name ?? '');
    const [profileEmail, setProfileEmail] = useState(user?.email ?? '');

    const [profileSaving, setProfileSaving] = useState(false);
    const [profileMessage, setProfileMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const [currentPassword, setCurrentPassword] = useState('');
    const [newPassword, setNewPassword] = useState('');
    const [confirmPassword, setConfirmPassword] = useState('');

    const [passwordSaving, setPasswordSaving] = useState(false);
    const [passwordMessage, setPasswordMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

    const handleProfileSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setProfileMessage(null);

        if (profileName.trim() === '' && profileEmail.trim() === '') return;

        setProfileSaving(true);
        try {
            const res = await fetch('/api/auth/me', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ name: profileName, email: profileEmail })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to update profile');
            }

            setProfileMessage({ type: 'success', text: 'Profile updated successfully. Refreshing...' });

            // If the email changed, we got a new token. It's easiest to just force a reload,
            // or logout the user, because we don't have a specific updateToken function in AuthContext.
            setTimeout(() => {
                window.location.reload();
            }, 1000);

        } catch (err) {
            setProfileMessage({ type: 'error', text: err instanceof Error ? err.message : 'An error occurred' });
        } finally {
            setProfileSaving(false);
        }
    };

    const handlePasswordSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        setPasswordMessage(null);

        if (newPassword !== confirmPassword) {
            setPasswordMessage({ type: 'error', text: 'New passwords do not match' });
            return;
        }

        if (newPassword.length < 8) {
            setPasswordMessage({ type: 'error', text: 'New password must be at least 8 characters long' });
            return;
        }

        setPasswordSaving(true);
        try {
            const res = await fetch('/api/auth/password', {
                method: 'PUT',
                headers: {
                    'Content-Type': 'application/json',
                    'Authorization': `Bearer ${token}`
                },
                body: JSON.stringify({ currentPassword, newPassword })
            });

            const data = await res.json();

            if (!res.ok) {
                throw new Error(data.message || 'Failed to change password');
            }

            setPasswordMessage({ type: 'success', text: 'Password changed successfully. Please log in again.' });
            setCurrentPassword('');
            setNewPassword('');
            setConfirmPassword('');

            setTimeout(() => logout(), 1500);

        } catch (err) {
            setPasswordMessage({ type: 'error', text: err instanceof Error ? err.message : 'An error occurred' });
        } finally {
            setPasswordSaving(false);
        }
    };

    if (!user) return null;

    return (
        <div className="space-y-6">
            <Card>
                <CardHeader>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Profile</h3>
                    <p className="mt-1 text-sm text-gray-500">Update your personal information.</p>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handleProfileSubmit}>
                        {profileMessage && (
                            <div className={`p-4 rounded-md flex gap-3 ${profileMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700 border border-green-500'}`}>
                                {profileMessage.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-green-600" />}
                                <p className="text-sm">{profileMessage.text}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="name" className="block text-sm font-medium text-gray-700">Name</label>
                            <Input
                                id="name"
                                value={profileName}
                                onChange={(e) => setProfileName(e.target.value)}
                                placeholder="Your name"
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="email" className="block text-sm font-medium text-gray-700">Email address</label>
                            <Input
                                id="email"
                                type="email"
                                value={profileEmail}
                                onChange={(e) => setProfileEmail(e.target.value)}
                                required
                            />
                        </div>

                        <Button type="submit" disabled={profileSaving || (profileName === (user.name ?? '') && profileEmail === user.email)}>
                            {profileSaving ? 'Saving...' : 'Save Changes'}
                        </Button>
                    </form>
                </CardContent>
            </Card>

            <Card>
                <CardHeader>
                    <h3 className="text-lg font-medium leading-6 text-gray-900">Security</h3>
                    <p className="mt-1 text-sm text-gray-500">Update your password. You will be logged out after changing your password.</p>
                </CardHeader>
                <CardContent>
                    <form className="space-y-4" onSubmit={handlePasswordSubmit}>
                        {passwordMessage && (
                            <div className={`p-4 rounded-md flex gap-3 ${passwordMessage.type === 'error' ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700 border border-green-500'}`}>
                                {passwordMessage.type === 'error' ? <AlertCircle className="w-5 h-5" /> : <CheckCircle className="w-5 h-5 text-green-600" />}
                                <p className="text-sm">{passwordMessage.text}</p>
                            </div>
                        )}

                        <div className="space-y-2">
                            <label htmlFor="currentPassword" className="block text-sm font-medium text-gray-700">Current Password</label>
                            <Input
                                id="currentPassword"
                                type="password"
                                value={currentPassword}
                                onChange={(e) => setCurrentPassword(e.target.value)}
                                required
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="newPassword" className="block text-sm font-medium text-gray-700">New Password</label>
                            <Input
                                id="newPassword"
                                type="password"
                                value={newPassword}
                                onChange={(e) => setNewPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                        </div>

                        <div className="space-y-2">
                            <label htmlFor="confirmPassword" className="block text-sm font-medium text-gray-700">Confirm New Password</label>
                            <Input
                                id="confirmPassword"
                                type="password"
                                value={confirmPassword}
                                onChange={(e) => setConfirmPassword(e.target.value)}
                                required
                                minLength={8}
                            />
                        </div>

                        <Button type="submit" variant="secondary" disabled={passwordSaving || !currentPassword || !newPassword || !confirmPassword}>
                            {passwordSaving ? 'Updating...' : 'Change Password'}
                        </Button>
                    </form>
                </CardContent>
            </Card>
        </div>
    );
}
