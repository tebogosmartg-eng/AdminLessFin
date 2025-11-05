import { useState, useEffect } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { supabase } from '../integrations/supabase/client';
import { Avatar, AvatarFallback, AvatarImage } from './ui/avatar';
import { Button } from './ui/button';
import { Input } from './ui/input';
import { showError, showSuccess } from '../utils/toast';
import { User } from 'lucide-react';

const AvatarUploader = () => {
  const { user, profile, refreshProfile } = useAuth();
  const [uploading, setUploading] = useState(false);
  const [avatarUrl, setAvatarUrl] = useState<string | null>(null);

  useEffect(() => {
    if (profile?.avatar_url) {
      setAvatarUrl(profile.avatar_url);
    }
  }, [profile]);

  const handleUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    try {
      setUploading(true);
      if (!event.target.files || event.target.files.length === 0) {
        throw new Error('You must select an image to upload.');
      }
      if (!user) throw new Error('User not found.');

      const file = event.target.files[0];
      const fileExt = file.name.split('.').pop();
      const filePath = `${user.id}/${Math.random()}.${fileExt}`;

      const { error: uploadError } = await supabase.storage
        .from('avatars')
        .upload(filePath, file, { upsert: true });

      if (uploadError) throw uploadError;

      const { data: { publicUrl } } = supabase.storage
        .from('avatars')
        .getPublicUrl(filePath);

      const { error: updateError } = await supabase
        .from('profiles')
        .update({ avatar_url: publicUrl })
        .eq('id', user.id);

      if (updateError) throw updateError;

      setAvatarUrl(publicUrl);
      await refreshProfile();
      showSuccess('Avatar updated successfully!');
    } catch (error: any) {
      showError(error.message);
    } finally {
      setUploading(false);
    }
  };

  const getInitials = (name: string | null | undefined) => {
    if (!name) return '';
    return name.split(' ').map(n => n[0]).join('').toUpperCase();
  }

  return (
    <div className="flex items-center space-x-4">
      <Avatar className="h-20 w-20">
        <AvatarImage src={avatarUrl || undefined} alt="User avatar" />
        <AvatarFallback>
          {profile?.full_name ? getInitials(profile.full_name) : <User className="h-8 w-8" />}
        </AvatarFallback>
      </Avatar>
      <div className="flex flex-col space-y-2">
        <label htmlFor="avatar-upload" className="cursor-pointer">
          <Button asChild>
            <span>{uploading ? 'Uploading...' : 'Upload New Picture'}</span>
          </Button>
          <Input
            id="avatar-upload"
            type="file"
            className="hidden"
            accept="image/*"
            onChange={handleUpload}
            disabled={uploading}
          />
        </label>
        <p className="text-xs text-gray-500">PNG, JPG, GIF up to 10MB.</p>
      </div>
    </div>
  );
};

export default AvatarUploader;