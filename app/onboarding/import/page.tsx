'use client';

import { useUser } from '@clerk/nextjs';
import { motion } from 'framer-motion';
import {
  AlertCircle,
  ArrowRight,
  Camera,
  CheckCircle2,
  FileText,
  Github,
  Linkedin,
  Link as LinkIcon,
  Loader2,
  Plus,
  Upload,
  X,
} from 'lucide-react';
import { useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';

import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Spinner } from '@/components/ui/spinner';
import { fileToBase64, getBestResolutionImage, parsePhoneWithCountryCode } from '@/lib/utils';

// Storage key prefix for persisting onboarding state across OAuth redirects
const ONBOARDING_IMPORT_STATE_KEY_PREFIX = 'follio_onboarding_import_state_';

// IndexedDB key for storing large uploaded photos
const UPLOADED_PHOTO_DB_NAME = 'follio_onboarding';
const UPLOADED_PHOTO_STORE_NAME = 'uploaded_photos';

// Helper to get user-specific storage key
const getStorageKey = (userId: string | undefined) => {
  return userId ? `${ONBOARDING_IMPORT_STATE_KEY_PREFIX}${userId}` : null;
};

// IndexedDB helpers for storing large uploaded photos (sessionStorage has ~5MB limit)
const openPhotoDatabase = (): Promise<IDBDatabase> => {
  return new Promise((resolve, reject) => {
    const request = indexedDB.open(UPLOADED_PHOTO_DB_NAME, 1);
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve(request.result);
    request.onupgradeneeded = (event) => {
      const db = (event.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(UPLOADED_PHOTO_STORE_NAME)) {
        db.createObjectStore(UPLOADED_PHOTO_STORE_NAME, { keyPath: 'key' });
      }
    };
  });
};

const savePhotoToIndexedDB = async (key: string, photoBase64: string): Promise<void> => {
  const db = await openPhotoDatabase();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readwrite');
    const store = transaction.objectStore(UPLOADED_PHOTO_STORE_NAME);
    const request = store.put({ key, data: photoBase64 });
    request.onerror = () => reject(request.error);
    request.onsuccess = () => resolve();
  });
};

const _getPhotoFromIndexedDB = async (key: string): Promise<string | null> => {
  try {
    const db = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readonly');
      const store = transaction.objectStore(UPLOADED_PHOTO_STORE_NAME);
      const request = store.get(key);
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve(request.result?.data || null);
    });
  } catch {
    return null;
  }
};

const _clearPhotosFromIndexedDB = async (): Promise<void> => {
  try {
    const db = await openPhotoDatabase();
    return new Promise((resolve, reject) => {
      const transaction = db.transaction(UPLOADED_PHOTO_STORE_NAME, 'readwrite');
      const store = transaction.objectStore(UPLOADED_PHOTO_STORE_NAME);
      const request = store.clear();
      request.onerror = () => reject(request.error);
      request.onsuccess = () => resolve();
    });
  } catch {
    // Ignore errors when clearing
  }
};

type ImportSource = 'resume' | 'github' | 'linkedin' | 'links';

interface ImportStatus {
  source: ImportSource;
  // 'added' = file uploaded, parsing in background (shows instant success feedback)
  status: 'idle' | 'added' | 'importing' | 'success' | 'error';
  message?: string;
  itemsImported?: number;
}

interface ManualLink {
  url: string;
  label?: string;
}

// Persisted state interface for sessionStorage
interface PersistedImportState {
  imports: Record<ImportSource, ImportStatus>;
  importedData: Record<string, unknown>;
  githubUsername: string;
}

export default function OnboardingImportPage() {
  const router = useRouter();
  const { user, isLoaded: isUserLoaded } = useUser();
  const [isCreatingProfile, _setIsCreatingProfile] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [hasRestoredPersistedState, setHasRestoredPersistedState] = useState(false);
  const [isCheckingProfile, setIsCheckingProfile] = useState(true);

  // Check if user already has a profile (for returning users who land here via sign-up flow)
  useEffect(() => {
    if (!isUserLoaded) return;

    const checkExistingProfile = async () => {
      try {
        const response = await fetch('/api/profile');
        if (response.ok) {
          const data = await response.json();
          // If user has a profile with a handle, redirect to their profile page
          if (data?.profile?.handle) {
            router.replace('/me');
            return;
          }
        }
      } catch (err) {
        // If there's an error, just continue with onboarding
        console.error('Error checking for existing profile:', err);
      }
      setIsCheckingProfile(false);
    };

    checkExistingProfile();
  }, [isUserLoaded, router]);

  // GitHub OAuth states
  const [githubConnecting, setGithubConnecting] = useState(false);
  const [githubDisconnecting, setGithubDisconnecting] = useState(false);
  const [githubError, setGithubError] = useState<string | null>(null);

  // LinkedIn OAuth states
  const [linkedinConnecting, setLinkedinConnecting] = useState(false);
  const [linkedinDisconnecting, setLinkedinDisconnecting] = useState(false);
  const [linkedinError, setLinkedinError] = useState<string | null>(null);

  // Import states
  const [imports, setImports] = useState<Record<ImportSource, ImportStatus>>({
    resume: { source: 'resume', status: 'idle' },
    github: { source: 'github', status: 'idle' },
    linkedin: { source: 'linkedin', status: 'idle' },
    links: { source: 'links', status: 'idle' },
  });

  // Form states
  const [githubUsername, setGithubUsername] = useState('');
  const [manualLinks, setManualLinks] = useState<ManualLink[]>([{ url: '' }]);
  const [showLinksForm, setShowLinksForm] = useState(false);

  // Profile photo state - grid-based picker
  const [uploadedPhotos, setUploadedPhotos] = useState<string[]>([]); // Array of uploaded base64 photos
  const [selectedPhotoId, setSelectedPhotoId] = useState<string | null>(null); // 'google', 'linkedin', 'github', 'upload-0', 'upload-1', etc. or null for none
  const [isUploadingPhoto, setIsUploadingPhoto] = useState(false);

  // Resume filename state
  const [resumeFileName, setResumeFileName] = useState<string | null>(null);

  // Track resume parsing promise for Continue button to wait on
  const [resumeParsingPromise, setResumeParsingPromise] = useState<Promise<void> | null>(null);
  const [isWaitingForParsing, setIsWaitingForParsing] = useState(false);

  // Imported data (for display)
  const [importedData, setImportedData] = useState<Record<string, unknown>>({});

  // Get connected GitHub account from Clerk
  const connectedGithub = user?.externalAccounts?.find((a) => a.provider === 'github');
  const githubUsernameFromAccount = connectedGithub?.username ?? null;

  // Get connected LinkedIn account from Clerk (check multiple possible provider names)
  const connectedLinkedin = user?.externalAccounts?.find((a) => {
    const provider = a.provider as string;
    return (
      provider === 'linkedin_oidc' ||
      provider === 'linkedin' ||
      provider === 'oauth_linkedin_oidc' ||
      provider === 'oauth_linkedin'
    );
  });
  // Build LinkedIn display - prioritize username, then fall back to name
  const linkedinName = (() => {
    // First check if we have imported data from LinkedIn
    const linkedinImport = importedData.linkedin as
      | {
          profile?: { firstName?: string; lastName?: string };
          email?: string;
          fromLinkedIn?: { username?: string };
        }
      | undefined;

    // Prioritize username from imported data
    if (linkedinImport?.fromLinkedIn?.username) {
      return linkedinImport.fromLinkedIn.username;
    }
    // Try external account username
    if (connectedLinkedin?.username) {
      return connectedLinkedin.username;
    }
    // Fall back to name from imported data
    if (linkedinImport?.profile?.firstName && linkedinImport?.profile?.lastName) {
      return `${linkedinImport.profile.firstName} ${linkedinImport.profile.lastName}`;
    }
    if (linkedinImport?.profile?.firstName || linkedinImport?.profile?.lastName) {
      return linkedinImport.profile.firstName || linkedinImport.profile.lastName;
    }
    // Try external account name
    if (connectedLinkedin?.firstName && connectedLinkedin?.lastName) {
      return `${connectedLinkedin.firstName} ${connectedLinkedin.lastName}`;
    }
    if (connectedLinkedin?.firstName || connectedLinkedin?.lastName) {
      return connectedLinkedin.firstName || connectedLinkedin.lastName;
    }
    // No LinkedIn data available yet
    return null;
  })();

  // Save import state to sessionStorage (used before OAuth redirects)
  const saveImportState = useCallback(() => {
    const storageKey = getStorageKey(user?.id);
    if (!storageKey) return;

    try {
      const stateToSave: PersistedImportState = {
        imports,
        importedData,
        githubUsername,
      };
      sessionStorage.setItem(storageKey, JSON.stringify(stateToSave));
    } catch (err) {
      console.error('Failed to save import state:', err);
    }
  }, [imports, importedData, githubUsername, user?.id]);

  // Restore state from sessionStorage on mount (for after OAuth redirects)
  useEffect(() => {
    if (hasRestoredPersistedState || !isUserLoaded || !user?.id) return;

    const storageKey = getStorageKey(user.id);
    if (!storageKey) {
      setHasRestoredPersistedState(true);
      return;
    }

    try {
      const savedState = sessionStorage.getItem(storageKey);
      if (savedState) {
        const parsed: PersistedImportState = JSON.parse(savedState);

        // Restore import statuses
        if (parsed.imports) {
          setImports(parsed.imports);
        }

        // Restore imported data
        if (parsed.importedData) {
          setImportedData(parsed.importedData);
        }

        // Restore GitHub username
        if (parsed.githubUsername) {
          setGithubUsername(parsed.githubUsername);
        }

        // Clear the saved state after restoring
        sessionStorage.removeItem(storageKey);

        // Reload user to get updated external accounts after OAuth redirect
        user.reload().catch(console.error);
      }
    } catch (err) {
      console.error('Failed to restore import state:', err);
    }

    setHasRestoredPersistedState(true);
  }, [hasRestoredPersistedState, isUserLoaded, user]);

  // Auto-import from connected GitHub if just connected via OAuth
  useEffect(() => {
    if (!isUserLoaded || !hasRestoredPersistedState) return;

    // If user has connected GitHub via OAuth and we haven't imported yet
    if (githubUsernameFromAccount && imports.github.status === 'idle') {
      // Auto-trigger import with the connected username
      updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });

      fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: githubUsernameFromAccount }),
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            updateImportStatus('github', {
              status: 'error',
              message: data.error || 'Failed to import from GitHub',
            });
          } else {
            setImportedData((prev) => ({ ...prev, github: data.data }));
            updateImportStatus('github', {
              status: 'success',
              message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
              itemsImported:
                (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
            });
            setGithubUsername(githubUsernameFromAccount);
          }
        })
        .catch((err) => {
          updateImportStatus('github', {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to import from GitHub',
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, hasRestoredPersistedState, githubUsernameFromAccount, imports.github.status]);

  // Auto-import from connected LinkedIn if just connected via OAuth
  useEffect(() => {
    if (!isUserLoaded || !hasRestoredPersistedState) return;

    // If user has connected LinkedIn via OAuth and we haven't imported yet
    if (connectedLinkedin && imports.linkedin.status === 'idle') {
      // Auto-trigger import with the connected account data
      updateImportStatus('linkedin', {
        status: 'importing',
        message: 'Fetching LinkedIn data...',
      });

      fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      })
        .then((response) => response.json())
        .then((data) => {
          if (data.error) {
            updateImportStatus('linkedin', {
              status: 'error',
              message: data.error || 'Failed to import from LinkedIn',
            });
          } else {
            setImportedData((prev) => ({ ...prev, linkedin: data.data }));
            updateImportStatus('linkedin', {
              status: 'success',
              message: data.message || 'Imported profile data',
              itemsImported: data.data?.summary?.total || 1,
            });
          }
        })
        .catch((err) => {
          updateImportStatus('linkedin', {
            status: 'error',
            message: err instanceof Error ? err.message : 'Failed to import from LinkedIn',
          });
        });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isUserLoaded, hasRestoredPersistedState, connectedLinkedin, imports.linkedin.status]);

  const updateImportStatus = (source: ImportSource, update: Partial<ImportStatus>) => {
    setImports((prev) => ({
      ...prev,
      [source]: { ...prev[source], ...update },
    }));
  };

  // GitHub OAuth connect handler
  const handleGitHubConnect = async () => {
    setGithubConnecting(true);
    setGithubError(null);

    // Check if user has a verified email
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setGithubError(
        'Please verify your email first to connect GitHub. Check your inbox for a verification email, or use manual entry below.'
      );
      setGithubConnecting(false);
      return;
    }

    try {
      // Save state before OAuth redirect so we can restore it when we come back
      saveImportState();

      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_github',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err: unknown) {
      console.error('GitHub connect error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes('additional verification')) {
        setGithubError(
          'Email verification required. Please verify your email first, or enter your GitHub username manually below.'
        );
      } else if (errorMessage.includes('already connected')) {
        // Refresh user to get updated external accounts
        await user?.reload();
        setGithubError(null);
      } else {
        setGithubError(`Connection failed: ${errorMessage}. Try entering your username manually.`);
      }
      setGithubConnecting(false);
    }
  };

  // GitHub disconnect handler
  const handleGitHubDisconnect = async () => {
    if (!connectedGithub) return;

    setGithubDisconnecting(true);
    setGithubError(null);

    try {
      await connectedGithub.destroy();
      await user?.reload();
      // Reset import status for GitHub
      updateImportStatus('github', {
        status: 'idle',
        message: undefined,
        itemsImported: undefined,
      });
      setGithubUsername('');
    } catch (err: unknown) {
      console.error('GitHub disconnect error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setGithubError(`Failed to disconnect: ${errorMessage}`);
    } finally {
      setGithubDisconnecting(false);
    }
  };

  // Resume upload handler - provides instant feedback, parses in background
  const handleResumeUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type - only PDFs supported
    if (file.type !== 'application/pdf') {
      updateImportStatus('resume', {
        status: 'error',
        message: 'Only PDF files are supported. Please upload a PDF resume.',
      });
      return;
    }

    // Save the filename for display
    setResumeFileName(file.name);

    // INSTANT FEEDBACK: Show "added" status immediately so user feels the upload worked
    updateImportStatus('resume', {
      status: 'added',
      message: 'Resume added! Parsing in background...',
    });

    // Create parsing promise that can be awaited by Continue button
    const parsingPromise = (async () => {
      try {
        const formData = new FormData();
        formData.append('file', file);
        // Don't auto-save - we'll review first
        formData.append('saveToProfile', 'false');

        const response = await fetch('/api/import/resume', {
          method: 'POST',
          body: formData,
        });

        const data = await response.json();

        if (!response.ok) {
          throw new Error(data.error || 'Failed to parse resume');
        }

        setImportedData((prev) => ({ ...prev, resume: data.data }));

        // Count imported items
        const itemCount = countResumeItems(data.data);

        updateImportStatus('resume', {
          status: 'success',
          message: `Found ${itemCount} items (${Math.round((data.confidence || 0.5) * 100)}% confidence)`,
          itemsImported: itemCount,
        });
      } catch (err) {
        updateImportStatus('resume', {
          status: 'error',
          message: err instanceof Error ? err.message : 'Failed to import resume',
        });
      } finally {
        setResumeParsingPromise(null);
      }
    })();

    // Store the promise so Continue can wait for it if needed
    setResumeParsingPromise(parsingPromise);
  };

  // Count items from resume import
  const countResumeItems = (data: Record<string, unknown> | undefined): number => {
    if (!data) return 0;
    let count = 0;
    if (data.profile && Object.keys(data.profile as object).length > 0) count += 1;
    if (Array.isArray(data.experiences)) count += (data.experiences as unknown[]).length;
    if (Array.isArray(data.educations)) count += (data.educations as unknown[]).length;
    if (Array.isArray(data.projects)) count += (data.projects as unknown[]).length;
    if (Array.isArray(data.skills)) count += (data.skills as unknown[]).length;
    if (Array.isArray(data.links)) count += (data.links as unknown[]).length;
    return count;
  };

  // GitHub import handler
  const handleGitHubImport = async (overrideUsername?: string) => {
    const resolvedUsername = (overrideUsername ?? githubUsername).trim();
    if (!resolvedUsername) {
      // No username provided - show error
      updateImportStatus('github', {
        status: 'error',
        message: 'Please enter a GitHub username or connect with GitHub',
      });
      return;
    }

    updateImportStatus('github', { status: 'importing', message: 'Fetching GitHub data...' });

    try {
      const response = await fetch('/api/import/github', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: resolvedUsername }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import from GitHub');
      }

      setImportedData((prev) => ({ ...prev, github: data.data }));
      updateImportStatus('github', {
        status: 'success',
        message: data.message || `Imported ${data.data?.summary?.projects || 0} projects`,
        itemsImported: (data.data?.summary?.projects || 0) + (data.data?.summary?.skills || 0),
      });
      setGithubUsername(resolvedUsername);
    } catch (err) {
      updateImportStatus('github', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from GitHub',
      });
    }
  };

  // LinkedIn OAuth connect handler
  const handleLinkedInConnect = async () => {
    setLinkedinConnecting(true);
    setLinkedinError(null);

    // Check if user has a verified email
    const primaryEmail = user?.primaryEmailAddress;
    if (!primaryEmail?.verification?.status || primaryEmail.verification.status !== 'verified') {
      setLinkedinError(
        'Please verify your email first to connect LinkedIn. Check your inbox for a verification email.'
      );
      setLinkedinConnecting(false);
      return;
    }

    try {
      // Save state before OAuth redirect so we can restore it when we come back
      saveImportState();

      const externalAccount = await user?.createExternalAccount({
        strategy: 'oauth_linkedin_oidc',
        redirectUrl: window.location.href,
      });
      const url = externalAccount?.verification?.externalVerificationRedirectURL;
      if (url) {
        window.location.href = url.toString();
      }
    } catch (err: unknown) {
      console.error('LinkedIn connect error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);

      if (errorMessage.includes('additional verification')) {
        setLinkedinError('Email verification required. Please verify your email first.');
      } else if (errorMessage.includes('already connected')) {
        // Refresh user to get updated external accounts
        await user?.reload();
        setLinkedinError(null);
      } else {
        setLinkedinError(`Connection failed: ${errorMessage}`);
      }
      setLinkedinConnecting(false);
    }
  };

  // LinkedIn disconnect handler
  const handleLinkedInDisconnect = async () => {
    if (!connectedLinkedin) return;

    setLinkedinDisconnecting(true);
    setLinkedinError(null);

    try {
      await connectedLinkedin.destroy();
      await user?.reload();
      // Reset import status for LinkedIn
      updateImportStatus('linkedin', {
        status: 'idle',
        message: undefined,
        itemsImported: undefined,
      });
    } catch (err: unknown) {
      console.error('LinkedIn disconnect error:', err);
      const errorMessage = err instanceof Error ? err.message : String(err);
      setLinkedinError(`Failed to disconnect: ${errorMessage}`);
    } finally {
      setLinkedinDisconnecting(false);
    }
  };

  // LinkedIn import handler (for when already connected)
  const handleLinkedInImport = async () => {
    updateImportStatus('linkedin', {
      status: 'importing',
      message: 'Fetching LinkedIn data...',
    });

    try {
      const response = await fetch('/api/import/linkedin/oauth', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to import from LinkedIn');
      }

      setImportedData((prev) => ({ ...prev, linkedin: data.data }));
      updateImportStatus('linkedin', {
        status: 'success',
        message: data.message || 'Imported profile data',
        itemsImported: data.data?.summary?.total || 1,
      });
    } catch (err) {
      updateImportStatus('linkedin', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to import from LinkedIn',
      });
    }
  };

  // Manual links handler
  const handleAddLink = () => {
    setManualLinks((prev) => [...prev, { url: '' }]);
  };

  const handleRemoveLink = (index: number) => {
    setManualLinks((prev) => prev.filter((_, i) => i !== index));
  };

  const handleLinkChange = (index: number, value: string) => {
    setManualLinks((prev) => prev.map((link, i) => (i === index ? { ...link, url: value } : link)));
  };

  const handleSaveLinks = async () => {
    const validLinks = manualLinks.filter((l) => l.url.trim());
    if (validLinks.length === 0) {
      setShowLinksForm(false);
      return;
    }

    updateImportStatus('links', { status: 'importing', message: 'Processing links...' });

    try {
      const response = await fetch('/api/import/links', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ links: validLinks }),
      });

      const data = await response.json();

      if (!response.ok) {
        throw new Error(data.error || 'Failed to process links');
      }

      setImportedData((prev) => ({ ...prev, links: data.data }));
      updateImportStatus('links', {
        status: 'success',
        message: `Added ${data.data?.summary?.links || validLinks.length} links`,
        itemsImported: data.data?.summary?.links || validLinks.length,
      });
      setShowLinksForm(false);
    } catch (err) {
      updateImportStatus('links', {
        status: 'error',
        message: err instanceof Error ? err.message : 'Failed to process links',
      });
    }
  };

  // Profile photo upload handler
  const handlePhotoUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    // Validate file type
    if (!file.type.startsWith('image/')) {
      setError('Please upload an image file (JPEG, PNG, etc.)');
      return;
    }

    // Validate file size (max 40MB - modern smartphone photos can be large)
    if (file.size > 40 * 1024 * 1024) {
      setError('Image must be less than 40MB');
      return;
    }

    setIsUploadingPhoto(true);
    setError(null);

    try {
      // Convert to base64 for storage and preview
      const base64 = await fileToBase64(file);
      const newIndex = uploadedPhotos.length;
      setUploadedPhotos((prev) => [...prev, base64]);
      setSelectedPhotoId(`upload-${newIndex}`); // Auto-select newly uploaded photo
      setIsUploadingPhoto(false);
    } catch {
      setError('Failed to process image');
      setIsUploadingPhoto(false);
    }
  };

  // Remove an uploaded photo
  const handleRemoveUploadedPhoto = (index: number) => {
    setUploadedPhotos((prev) => prev.filter((_, i) => i !== index));
    // If the removed photo was selected, clear selection
    if (selectedPhotoId === `upload-${index}`) {
      setSelectedPhotoId(null);
    }
    // Adjust selectedPhotoId if it's an upload with higher index
    if (selectedPhotoId?.startsWith('upload-')) {
      const selectedIndex = parseInt(selectedPhotoId.split('-')[1]);
      if (selectedIndex > index) {
        setSelectedPhotoId(`upload-${selectedIndex - 1}`);
      }
    }
  };

  // Get all available photos as an array with source info
  interface PhotoOption {
    id: string;
    url: string;
    source: string;
    label: string;
  }

  // Detect the primary OAuth provider that provided the user's profile image
  const getPrimaryAuthProvider = (): { id: string; label: string } | null => {
    if (!user) return null;

    // Check verified external accounts in order of priority
    const verifiedAccounts =
      user.externalAccounts?.filter((a) => a.verification?.status === 'verified') || [];

    // Find the first OAuth provider that likely provided the profile image
    // Priority: Google > LinkedIn > GitHub > others
    // Cast to string to handle various provider naming conventions
    const googleAccount = verifiedAccounts.find(
      (a) => (a.provider as string) === 'oauth_google' || a.provider === 'google'
    );
    if (googleAccount) return { id: 'google', label: 'Google' };

    const linkedinAccount = verifiedAccounts.find(
      (a) =>
        a.provider === 'linkedin_oidc' ||
        a.provider === 'linkedin' ||
        (a.provider as string) === 'oauth_linkedin_oidc' ||
        (a.provider as string) === 'oauth_linkedin'
    );
    if (linkedinAccount) return { id: 'linkedin-sso', label: 'LinkedIn' };

    const githubAccount = verifiedAccounts.find(
      (a) => a.provider === 'github' || (a.provider as string) === 'oauth_github'
    );
    if (githubAccount) return { id: 'github-sso', label: 'GitHub' };

    // If there's any other OAuth provider
    if (verifiedAccounts.length > 0) {
      const provider = verifiedAccounts[0].provider || 'sso';
      // Clean up provider name for display (e.g., 'oauth_facebook' -> 'Facebook')
      const label = provider.replace('oauth_', '').replace('_oidc', '').replace(/_/g, ' ');
      const capitalizedLabel = label.charAt(0).toUpperCase() + label.slice(1);
      return { id: 'sso', label: capitalizedLabel };
    }

    // User signed up with email/password - no OAuth provider
    return null;
  };

  const getAvailablePhotos = (): PhotoOption[] => {
    const photos: PhotoOption[] = [];
    const seenUrls = new Set<string>(); // Track URLs to avoid duplicates

    // Helper to add photo only if URL is unique
    const addPhoto = (photo: PhotoOption) => {
      // Normalize URL for comparison (ignore query params, protocol differences)
      const normalizedUrl = photo.url.split('?')[0].toLowerCase();
      if (!seenUrls.has(normalizedUrl)) {
        seenUrls.add(normalizedUrl);
        photos.push(photo);
      }
    };

    // LinkedIn photo from import (prioritize imported data over SSO)
    const linkedinData = importedData.linkedin as Record<string, unknown> | undefined;
    const linkedinProfile = linkedinData?.profile as Record<string, unknown> | undefined;
    if (linkedinProfile?.avatarUrl) {
      addPhoto({
        id: 'linkedin',
        url: linkedinProfile.avatarUrl as string,
        source: 'linkedin',
        label: 'LinkedIn',
      });
    }

    // GitHub photo from import (prioritize imported data over SSO)
    const githubData = importedData.github as Record<string, unknown> | undefined;
    const githubProfile = githubData?.profile as Record<string, unknown> | undefined;
    if (githubProfile?.avatarUrl) {
      addPhoto({
        id: 'github',
        url: githubProfile.avatarUrl as string,
        source: 'github',
        label: 'GitHub',
      });
    }

    // SSO/OAuth profile photo (only if not already added from import and user has real image)
    const primaryAuthProvider = getPrimaryAuthProvider();
    if (user?.imageUrl && user?.hasImage && primaryAuthProvider) {
      addPhoto({
        id: primaryAuthProvider.id,
        url: user.imageUrl,
        source: primaryAuthProvider.id,
        label: primaryAuthProvider.label,
      });
    }

    // Uploaded photos
    uploadedPhotos.forEach((photo, index) => {
      addPhoto({
        id: `upload-${index}`,
        url: photo,
        source: 'upload',
        label: `Upload ${index + 1}`,
      });
    });

    return photos;
  };

  // Get the currently selected photo URL
  const getSelectedPhotoUrl = (): string | null => {
    if (!selectedPhotoId) return null;
    const photos = getAvailablePhotos();
    const selected = photos.find((p) => p.id === selectedPhotoId);
    return selected?.url || null;
  };

  // Create profile and continue - ALWAYS goes to review
  const handleContinue = async () => {
    // If resume is still being parsed, wait for it to complete
    // This ensures the user gets their resume data even if they click Continue quickly
    if (resumeParsingPromise) {
      setIsWaitingForParsing(true);
      try {
        await resumeParsingPromise;
      } finally {
        setIsWaitingForParsing(false);
      }
    }

    // Use the selected photo from the grid, or pick the best resolution if none selected
    let bestAvatarUrl: string | null = getSelectedPhotoUrl();

    // If no photo selected, compare resolutions of available photos to find the best one
    if (!bestAvatarUrl) {
      const photos = getAvailablePhotos();
      if (photos.length > 0) {
        const avatarCandidates = photos.map((p) => p.url);
        bestAvatarUrl = await getBestResolutionImage(avatarCandidates);
      }
    }

    // Collect data from ALL sources
    const resumeData = importedData.resume as Record<string, unknown> | undefined;
    const linkedinData = importedData.linkedin as Record<string, unknown> | undefined;
    const githubData = importedData.github as Record<string, unknown> | undefined;

    // Get profile data from various sources
    const resumeProfile = (resumeData?.profile as Record<string, unknown>) || {};
    const linkedinProfile = (linkedinData?.profile as Record<string, unknown>) || {};
    const githubProfile = (githubData?.profile as Record<string, unknown>) || {};
    const resumeContactInfo = resumeData?.contactInfo as Record<string, unknown> | undefined;

    // Collect ALL names from ALL sources for review
    // Format: { firstName, lastName, source }
    const allNames: Array<{ firstName?: string; lastName?: string; source: string }> = [];

    // FIRST: Add signup name (from Clerk)
    if (user?.firstName || user?.lastName) {
      allNames.push({
        firstName: user.firstName || undefined,
        lastName: user.lastName || undefined,
        source: 'SIGNUP',
      });
    }

    // Name from resume
    if (resumeProfile.firstName || resumeProfile.lastName) {
      allNames.push({
        firstName: resumeProfile.firstName as string | undefined,
        lastName: resumeProfile.lastName as string | undefined,
        source: 'RESUME',
      });
    }

    // Name from LinkedIn
    if (linkedinProfile.firstName || linkedinProfile.lastName) {
      allNames.push({
        firstName: linkedinProfile.firstName as string | undefined,
        lastName: linkedinProfile.lastName as string | undefined,
        source: 'LINKEDIN',
      });
    }

    // Name from GitHub
    if (githubProfile.firstName || githubProfile.lastName) {
      allNames.push({
        firstName: githubProfile.firstName as string | undefined,
        lastName: githubProfile.lastName as string | undefined,
        source: 'GITHUB',
      });
    }

    // Build merged profile - use resume data as base if available, otherwise build from other sources
    // Name precedence for display: Resume > LinkedIn > GitHub > Signup (but all shown in review)
    const mergedProfile: Record<string, unknown> = {
      firstName:
        resumeProfile.firstName ||
        linkedinProfile.firstName ||
        githubProfile.firstName ||
        user?.firstName,
      lastName:
        resumeProfile.lastName ||
        linkedinProfile.lastName ||
        githubProfile.lastName ||
        user?.lastName,
      headline: resumeProfile.headline || linkedinProfile.headline || githubProfile.headline,
      summary: resumeProfile.summary || linkedinProfile.summary || githubProfile.bio,
      location: resumeProfile.location || linkedinProfile.location || githubProfile.location,
      avatarUrl: bestAvatarUrl,
    };

    // Collect ALL emails from ALL sources for the review page
    const allEmails: Array<{ email: string; source: string }> = [];

    // FIRST: Add signup email as primary (from Clerk)
    const signupEmail = user?.primaryEmailAddress?.emailAddress;
    if (signupEmail) {
      allEmails.push({ email: signupEmail, source: 'SIGNUP' });
    }

    // Email from resume
    if (resumeContactInfo?.email) {
      allEmails.push({ email: resumeContactInfo.email as string, source: 'RESUME' });
    }

    // Email from LinkedIn
    if (linkedinData) {
      const linkedinContactInfo = linkedinData.contactInfo as Record<string, unknown> | undefined;
      if (linkedinContactInfo?.email) {
        allEmails.push({ email: linkedinContactInfo.email as string, source: 'LINKEDIN' });
      }
      if (linkedinData.email && typeof linkedinData.email === 'string') {
        allEmails.push({ email: linkedinData.email, source: 'LINKEDIN' });
      }
    }

    // Email from GitHub
    if (githubData) {
      const githubContactInfo = githubData.contactInfo as Record<string, unknown> | undefined;
      if (githubContactInfo?.email) {
        allEmails.push({ email: githubContactInfo.email as string, source: 'GITHUB' });
      }
    }

    // Deduplicate emails (signup email stays first since it was added first)
    const seenEmails = new Set<string>();
    const uniqueEmails = allEmails.filter((e) => {
      const normalized = e.email.toLowerCase().trim();
      if (seenEmails.has(normalized)) return false;
      seenEmails.add(normalized);
      return true;
    });

    // Collect ALL phones from ALL sources (with optional country code)
    const allPhones: Array<{
      phone?: string;
      countryCode?: string | null;
      number?: string;
      source: string;
    }> = [];

    if (resumeContactInfo?.phone) {
      // Resume phone - try to parse country code from the raw string
      const phoneStr = resumeContactInfo.phone as string;
      const parsed = parsePhoneWithCountryCode(phoneStr);
      allPhones.push({
        phone: phoneStr,
        countryCode: parsed.countryCode,
        number: parsed.number || phoneStr,
        source: 'RESUME',
      });
    }

    if (linkedinData) {
      const linkedinContactInfo = linkedinData.contactInfo as Record<string, unknown> | undefined;
      if (linkedinContactInfo?.phone) {
        const phoneStr = linkedinContactInfo.phone as string;
        const parsed = parsePhoneWithCountryCode(phoneStr);
        allPhones.push({
          phone: phoneStr,
          countryCode: parsed.countryCode,
          number: parsed.number || phoneStr,
          source: 'LINKEDIN',
        });
      }
    }

    // Deduplicate phones
    const seenPhones = new Set<string>();
    const uniquePhones = allPhones.filter((p) => {
      const phoneNum = p.number || p.phone || '';
      const normalized = phoneNum.replace(/\D/g, '');
      if (seenPhones.has(normalized)) return false;
      seenPhones.add(normalized);
      return true;
    });

    // Build contact info
    const contactInfo = {
      ...(resumeContactInfo || {}),
      allEmails: uniqueEmails,
      allPhones: uniquePhones,
    };

    // Handle large uploaded photos - store in IndexedDB instead of sessionStorage
    const avatarUrlForStorage = mergedProfile.avatarUrl as string | undefined;
    if (avatarUrlForStorage?.startsWith('data:')) {
      try {
        const photoKey = `uploaded_avatar_${Date.now()}`;
        await savePhotoToIndexedDB(photoKey, avatarUrlForStorage);
        mergedProfile.avatarUrl = `indexeddb:${photoKey}`;
      } catch (err) {
        console.error('Failed to store photo in IndexedDB:', err);
        delete mergedProfile.avatarUrl;
      }
    }

    // Merge and deduplicate links from all sources by URL
    const allLinks = [
      ...((resumeData?.links as Array<Record<string, unknown>>) || []),
      ...((linkedinData?.links as Array<Record<string, unknown>>) || []),
      ...((githubData?.links as Array<Record<string, unknown>>) || []),
    ];
    const seenUrls = new Set<string>();
    const uniqueLinks = allLinks.filter((link) => {
      const url = (link.url as string)?.toLowerCase().trim();
      if (!url || seenUrls.has(url)) return false;
      seenUrls.add(url);
      return true;
    });

    // Merge all data for review - include data from all sources
    const dataForReview = {
      profile: mergedProfile,
      contactInfo,
      // Include all name options for review
      allNames,
      // Include experiences, education, skills, etc. from resume if available
      experiences: resumeData?.experiences || [],
      educations: resumeData?.educations || [],
      skills: [
        ...((resumeData?.skills as string[]) || []),
        ...((githubData?.skills as string[]) || []),
      ].filter((s, i, arr) => arr.indexOf(s) === i), // Dedupe
      links: uniqueLinks,
      certifications: resumeData?.certifications || [],
      projects: [
        ...((resumeData?.projects as Array<Record<string, unknown>>) || []),
        ...((githubData?.projects as Array<Record<string, unknown>>) || []),
      ],
      // Pass through original imported data for reference
      _sources: {
        hasResume: !!resumeData,
        hasLinkedIn: !!linkedinData,
        hasGitHub: !!githubData,
      },
    };

    sessionStorage.setItem('onboarding_parsed_resume', JSON.stringify(dataForReview));
    router.push('/onboarding/review');
  };

  // Get overall import count
  const getTotalImported = () => {
    return Object.values(imports).reduce((acc, imp) => acc + (imp.itemsImported || 0), 0);
  };

  // Consider both 'added' (parsing in background) and 'success' as having an import
  const hasAnyImport = Object.values(imports).some(
    (i) => i.status === 'success' || i.status === 'added'
  );

  // Show loading state while checking for existing profile
  if (isCheckingProfile) {
    return (
      <div className="flex min-h-[60vh] items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <Spinner size="lg" />
          <p className="text-muted-foreground">Loading...</p>
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Progress bar */}
      <div className="fixed left-0 right-0 top-16 z-40 h-1 bg-muted">
        <motion.div
          className="h-full bg-primary"
          initial={{ width: '33%' }}
          animate={{ width: '66%' }}
          transition={{ duration: 0.3 }}
        />
      </div>

      <div className="mx-auto max-w-4xl px-4 py-16">
        {/* Header */}
        <motion.div
          className="mb-12 text-center"
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.5 }}
        >
          <h1 className="text-4xl font-bold tracking-tight">Bring your data</h1>
          <p className="mt-3 text-lg text-muted-foreground">
            Connect your sources and watch your profile come to life
          </p>
        </motion.div>

        {/* Floating Cards Grid */}
        <div className="relative">
          {/* Decorative gradient blur */}
          <div className="pointer-events-none absolute -top-20 left-1/2 h-64 w-64 -translate-x-1/2 rounded-full bg-primary/20 blur-3xl" />

          <motion.div
            className="relative grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            transition={{ duration: 0.5, delay: 0.1 }}
          >
            {/* Profile Photo Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.1 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group"
            >
              <Card className="relative h-full overflow-hidden border-2 border-transparent bg-gradient-to-br from-background to-muted/30 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500/10 to-purple-500/10 ring-1 ring-violet-500/20">
                      <Camera className="h-6 w-6 text-violet-500" />
                    </div>
                    {selectedPhotoId && !isUploadingPhoto ? (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    ) : isUploadingPhoto ? (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    ) : null}
                  </div>

                  <h3 className="mb-1 font-semibold">Profile Photo</h3>
                  <p className="mb-4 text-sm text-muted-foreground">
                    {getAvailablePhotos().length > 0
                      ? 'Select a photo or upload your own'
                      : 'Upload a photo to personalize your profile'}
                  </p>

                  {/* Photo Grid */}
                  <div className="grid grid-cols-4 gap-2">
                    {getAvailablePhotos().map((photo) => (
                      <div key={photo.id} className="group/photo relative">
                        <button
                          type="button"
                          onClick={() =>
                            setSelectedPhotoId(selectedPhotoId === photo.id ? null : photo.id)
                          }
                          className={`relative aspect-square w-full overflow-hidden rounded-lg border-2 transition-all ${
                            selectedPhotoId === photo.id
                              ? 'border-primary ring-2 ring-primary/20'
                              : 'border-transparent hover:border-muted-foreground/30'
                          }`}
                        >
                          <Avatar className="h-full w-full rounded-lg">
                            <AvatarImage src={photo.url} className="h-full w-full object-cover" />
                            <AvatarFallback className="rounded-lg">{photo.label[0]}</AvatarFallback>
                          </Avatar>
                          {selectedPhotoId === photo.id && (
                            <div className="absolute inset-0 flex items-center justify-center bg-primary/10">
                              <CheckCircle2 className="h-5 w-5 text-primary" />
                            </div>
                          )}
                        </button>
                        {/* Source label */}
                        <span className="mt-1 block truncate text-center text-[10px] text-muted-foreground">
                          {photo.label}
                        </span>
                        {/* Remove button for uploaded photos */}
                        {photo.source === 'upload' && (
                          <button
                            type="button"
                            onClick={(e) => {
                              e.stopPropagation();
                              const index = parseInt(photo.id.split('-')[1]);
                              handleRemoveUploadedPhoto(index);
                            }}
                            className="absolute -right-1 -top-1 hidden h-5 w-5 items-center justify-center rounded-full bg-destructive text-destructive-foreground shadow-sm group-hover/photo:flex"
                          >
                            <X className="h-3 w-3" />
                          </button>
                        )}
                      </div>
                    ))}
                    {/* Upload button - always shown as last item */}
                    <div className="relative">
                      <button
                        type="button"
                        onClick={() => document.getElementById('photo-upload')?.click()}
                        disabled={isUploadingPhoto}
                        className="flex aspect-square w-full items-center justify-center rounded-lg border-2 border-dashed border-muted-foreground/30 transition-all hover:border-primary hover:bg-primary/5"
                      >
                        {isUploadingPhoto ? (
                          <Loader2 className="h-5 w-5 animate-spin text-muted-foreground" />
                        ) : (
                          <Plus className="h-5 w-5 text-muted-foreground" />
                        )}
                      </button>
                      <span className="mt-1 block text-center text-[10px] text-muted-foreground">
                        Upload
                      </span>
                    </div>
                  </div>

                  <input
                    id="photo-upload"
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={handlePhotoUpload}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* Resume Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.15 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group"
            >
              <Card className="relative h-full overflow-hidden border-2 border-transparent bg-gradient-to-br from-background to-muted/30 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-orange-500/10 to-red-500/10 ring-1 ring-orange-500/20">
                      <FileText className="h-6 w-6 text-orange-500" />
                    </div>
                    {/* Show checkmark for both 'added' and 'success' states for instant feedback */}
                    {(imports.resume.status === 'success' || imports.resume.status === 'added') && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {imports.resume.status === 'importing' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {imports.resume.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>

                  <h3 className="mb-1 font-semibold">Resume</h3>
                  <p className="mb-4 flex-1 text-sm text-muted-foreground">
                    Upload your resume to auto-fill your profile
                  </p>

                  {/* Show success-like UI for both 'added' (parsing in background) and 'success' states */}
                  {imports.resume.status === 'success' || imports.resume.status === 'added' ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className="max-w-[140px] truncate bg-green-500/10 text-green-600"
                          title={resumeFileName || undefined}
                        >
                          {resumeFileName || 'Imported'}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => document.getElementById('resume-upload')?.click()}
                          disabled={imports.resume.status === 'added'}
                        >
                          {imports.resume.status === 'added' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : (
                            'Replace'
                          )}
                        </Button>
                      </div>
                      <p className="text-xs text-muted-foreground">
                        {imports.resume.status === 'added' ? (
                          <span className="flex items-center gap-1">
                            <Loader2 className="h-3 w-3 animate-spin" />
                            Parsing in background...
                          </span>
                        ) : imports.resume.itemsImported ? (
                          `${imports.resume.itemsImported} items found`
                        ) : (
                          ''
                        )}
                      </p>
                    </div>
                  ) : (
                    <Button
                      variant="secondary"
                      size="sm"
                      className="w-full"
                      onClick={() => document.getElementById('resume-upload')?.click()}
                      disabled={imports.resume.status === 'importing'}
                    >
                      {imports.resume.status === 'importing' ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Upload className="mr-2 h-4 w-4" />
                      )}
                      {imports.resume.status === 'importing' ? 'Parsing...' : 'Upload PDF'}
                    </Button>
                  )}
                  {imports.resume.message && imports.resume.status === 'error' && (
                    <p className="mt-2 text-xs text-destructive">{imports.resume.message}</p>
                  )}
                  <input
                    id="resume-upload"
                    type="file"
                    accept=".pdf,application/pdf"
                    className="hidden"
                    onChange={handleResumeUpload}
                  />
                </CardContent>
              </Card>
            </motion.div>

            {/* GitHub Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.2 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group"
            >
              <Card className="relative h-full overflow-hidden border-2 border-transparent bg-gradient-to-br from-background to-muted/30 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-gray-500/10 to-slate-500/10 ring-1 ring-gray-500/20 dark:from-white/10 dark:to-gray-400/10 dark:ring-white/20">
                      <Github className="h-6 w-6 text-gray-700 dark:text-white" />
                    </div>
                    {imports.github.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {imports.github.status === 'importing' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {imports.github.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>

                  <h3 className="mb-1 font-semibold">GitHub</h3>
                  <p className="mb-4 flex-1 text-sm text-muted-foreground">
                    Import projects, skills & contributions
                  </p>

                  {connectedGithub ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className={
                            imports.github.status === 'success'
                              ? 'bg-green-500/10 text-green-600'
                              : ''
                          }
                        >
                          @{githubUsernameFromAccount}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() =>
                            githubUsernameFromAccount &&
                            handleGitHubImport(githubUsernameFromAccount)
                          }
                          disabled={imports.github.status === 'importing'}
                        >
                          {imports.github.status === 'importing' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : imports.github.status === 'success' ? (
                            'Refresh'
                          ) : (
                            'Import'
                          )}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full text-xs text-muted-foreground hover:text-destructive"
                        onClick={handleGitHubDisconnect}
                        disabled={githubDisconnecting}
                      >
                        {githubDisconnecting ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <X className="mr-1 h-3 w-3" />
                        )}
                        {githubDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-[#24292e] text-white hover:bg-[#1b1f23]"
                      onClick={handleGitHubConnect}
                      disabled={githubConnecting}
                    >
                      {githubConnecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Github className="mr-2 h-4 w-4" />
                      )}
                      {githubConnecting ? 'Connecting...' : 'Connect'}
                    </Button>
                  )}
                  {(githubError ||
                    (imports.github.message && imports.github.status === 'error')) && (
                    <p className="mt-2 text-xs text-destructive">
                      {githubError || imports.github.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* LinkedIn Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.25 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group"
            >
              <Card className="relative h-full overflow-hidden border-2 border-transparent bg-gradient-to-br from-background to-muted/30 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-blue-500/10 to-sky-500/10 ring-1 ring-blue-500/20">
                      <Linkedin className="h-6 w-6 text-[#0A66C2]" />
                    </div>
                    {imports.linkedin.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {imports.linkedin.status === 'importing' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                    {imports.linkedin.status === 'error' && (
                      <AlertCircle className="h-5 w-5 text-destructive" />
                    )}
                  </div>

                  <h3 className="mb-1 font-semibold">LinkedIn</h3>
                  <p className="mb-4 flex-1 text-sm text-muted-foreground">
                    Import profile info, headline & photo
                  </p>

                  {connectedLinkedin ? (
                    <div className="space-y-2">
                      <div className="flex items-center justify-between">
                        <Badge
                          variant="secondary"
                          className={
                            imports.linkedin.status === 'success'
                              ? 'bg-green-500/10 text-green-600'
                              : ''
                          }
                        >
                          {linkedinName || (
                            <span className="flex items-center gap-1">
                              <CheckCircle2 className="h-3 w-3" />
                              Account Linked
                            </span>
                          )}
                        </Badge>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleLinkedInImport}
                          disabled={imports.linkedin.status === 'importing'}
                        >
                          {imports.linkedin.status === 'importing' ? (
                            <Loader2 className="h-4 w-4 animate-spin" />
                          ) : imports.linkedin.status === 'success' ? (
                            'Refresh'
                          ) : (
                            'Import'
                          )}
                        </Button>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="h-7 w-full text-xs text-muted-foreground hover:text-destructive"
                        onClick={handleLinkedInDisconnect}
                        disabled={linkedinDisconnecting}
                      >
                        {linkedinDisconnecting ? (
                          <Loader2 className="mr-1 h-3 w-3 animate-spin" />
                        ) : (
                          <X className="mr-1 h-3 w-3" />
                        )}
                        {linkedinDisconnecting ? 'Disconnecting...' : 'Disconnect'}
                      </Button>
                    </div>
                  ) : (
                    <Button
                      size="sm"
                      className="w-full bg-[#0A66C2] text-white hover:bg-[#004182]"
                      onClick={handleLinkedInConnect}
                      disabled={linkedinConnecting}
                    >
                      {linkedinConnecting ? (
                        <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      ) : (
                        <Linkedin className="mr-2 h-4 w-4" />
                      )}
                      {linkedinConnecting ? 'Connecting...' : 'Connect'}
                    </Button>
                  )}
                  {(linkedinError ||
                    (imports.linkedin.message && imports.linkedin.status === 'error')) && (
                    <p className="mt-2 text-xs text-destructive">
                      {linkedinError || imports.linkedin.message}
                    </p>
                  )}
                </CardContent>
              </Card>
            </motion.div>

            {/* Links Card */}
            <motion.div
              initial={{ opacity: 0, y: 20 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.4, delay: 0.3 }}
              whileHover={{ y: -4, transition: { duration: 0.2 } }}
              className="group sm:col-span-2 lg:col-span-1"
            >
              <Card className="relative h-full overflow-hidden border-2 border-transparent bg-gradient-to-br from-background to-muted/30 transition-all duration-300 hover:border-primary/20 hover:shadow-xl hover:shadow-primary/5">
                <CardContent className="flex h-full flex-col p-5">
                  <div className="mb-4 flex items-start justify-between">
                    <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-gradient-to-br from-emerald-500/10 to-teal-500/10 ring-1 ring-emerald-500/20">
                      <LinkIcon className="h-6 w-6 text-emerald-500" />
                    </div>
                    {imports.links.status === 'success' && (
                      <CheckCircle2 className="h-5 w-5 text-green-500" />
                    )}
                    {imports.links.status === 'importing' && (
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    )}
                  </div>

                  <h3 className="mb-1 font-semibold">Links</h3>
                  <p className="mb-4 flex-1 text-sm text-muted-foreground">
                    Website, portfolio, blog, or any URL
                  </p>

                  {!showLinksForm ? (
                    imports.links.status === 'success' ? (
                      <div className="flex items-center justify-between">
                        <Badge variant="secondary" className="bg-green-500/10 text-green-600">
                          {imports.links.itemsImported} links
                        </Badge>
                        <Button variant="ghost" size="sm" onClick={() => setShowLinksForm(true)}>
                          Edit
                        </Button>
                      </div>
                    ) : (
                      <Button
                        variant="secondary"
                        size="sm"
                        className="w-full"
                        onClick={() => setShowLinksForm(true)}
                      >
                        <Plus className="mr-2 h-4 w-4" />
                        Add Links
                      </Button>
                    )
                  ) : (
                    <div className="space-y-2">
                      {manualLinks.map((link, index) => (
                        <div key={index} className="flex gap-2">
                          <Input
                            placeholder="https://..."
                            value={link.url}
                            onChange={(e) => handleLinkChange(index, e.target.value)}
                            className="h-8 text-sm"
                          />
                          {manualLinks.length > 1 && (
                            <Button
                              variant="ghost"
                              size="sm"
                              className="h-8 w-8 p-0"
                              onClick={() => handleRemoveLink(index)}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          )}
                        </div>
                      ))}
                      <div className="flex gap-2">
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={handleAddLink}
                          className="h-7 text-xs"
                        >
                          <Plus className="mr-1 h-3 w-3" />
                          Add
                        </Button>
                        <Button
                          size="sm"
                          onClick={handleSaveLinks}
                          disabled={imports.links.status === 'importing'}
                          className="h-7 text-xs"
                        >
                          {imports.links.status === 'importing' ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            'Save'
                          )}
                        </Button>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowLinksForm(false)}
                          className="h-7 text-xs"
                        >
                          Cancel
                        </Button>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </motion.div>
          </motion.div>
        </div>

        {/* Summary */}
        {hasAnyImport && (
          <motion.div
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            className="mt-8 rounded-2xl bg-gradient-to-r from-primary/5 via-primary/10 to-primary/5 p-6 text-center"
          >
            <div className="flex items-center justify-center gap-2">
              <CheckCircle2 className="h-5 w-5 text-primary" />
              <p className="text-sm">
                <span className="font-semibold text-foreground">{getTotalImported()}</span>{' '}
                <span className="text-muted-foreground">items ready to import</span>
              </p>
            </div>
          </motion.div>
        )}

        {/* Error message */}
        {error && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="mt-4 rounded-lg bg-destructive/10 p-3 text-sm text-destructive"
          >
            {error}
          </motion.div>
        )}

        {/* Actions */}
        <motion.div
          className="mt-10 flex flex-col items-center gap-4"
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.4 }}
        >
          <Button
            onClick={handleContinue}
            disabled={isCreatingProfile || isWaitingForParsing}
            className="gap-2 px-8"
            size="lg"
          >
            {isCreatingProfile ? (
              <>
                <Spinner size="sm" />
                Creating your profile...
              </>
            ) : isWaitingForParsing ? (
              <>
                <Spinner size="sm" />
                Finishing resume parsing...
              </>
            ) : importedData.resume ? (
              <>
                Review & Edit Parsed Data
                <ArrowRight className="h-4 w-4" />
              </>
            ) : imports.resume.status === 'added' ? (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            ) : (
              <>
                Continue
                <ArrowRight className="h-4 w-4" />
              </>
            )}
          </Button>
          <Button
            variant="ghost"
            onClick={handleContinue}
            disabled={isCreatingProfile}
            className="text-muted-foreground"
          >
            Skip for now
          </Button>
          <p className="text-center text-xs text-muted-foreground">
            You can always import more data later from your dashboard
          </p>
        </motion.div>

        {/* Progress indicator */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="h-2 w-8 rounded-full bg-primary" />
          <div className="h-2 w-8 rounded-full bg-primary" />
        </div>
      </div>
    </>
  );
}
