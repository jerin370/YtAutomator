import type { VideoDetails } from '../types';

// Fix: Add global declarations for gapi and google to fix TypeScript errors.
declare global {
    interface Window {
      gapi: any;
      google: any;
    }
}

// IMPORTANT: Replace with your own Google Cloud Project's Client ID
const CLIENT_ID = '705360192655-fqd1br2r6i5vok8e7q72np5cl0grt1go.apps.googleusercontent.com'; 

// NOTE: You can get a Client ID from the Google Cloud Console:
// 1. Go to https://console.cloud.google.com/
// 2. Create a new project or select an existing one.
// 3. Go to "APIs & Services" > "Credentials".
// 4. Click "Create Credentials" > "OAuth client ID".
// 5. Select "Web application" as the application type.
// 6. Under "Authorized JavaScript origins", add the URL of your application.
// 7. Copy the generated Client ID and paste it above.
// 8. Make sure the YouTube Data API v3 is enabled for your project under "APIs & Services" > "Library".

const SCOPES = 'https://www.googleapis.com/auth/youtube.upload';

// Fix: Changed type to `any` because the `google` namespace is not defined without @types.
let tokenClient: any | null = null;
let onAuthChange: ((isReady: boolean, isLoggedIn: boolean) => void) | null = null;
let gapiLoaded = false;
let gisLoaded = false;

const checkGisLoaded = () => {
    if (gapiLoaded && gisLoaded) {
        initializeClients();
    }
}

// Load GAPI script
const gapiScript = document.createElement('script');
gapiScript.src = 'https://apis.google.com/js/api.js';
gapiScript.async = true;
gapiScript.defer = true;
gapiScript.onload = () => {
    window.gapi.load('client', () => {
        gapiLoaded = true;
        checkGisLoaded();
    });
};
document.body.appendChild(gapiScript);

// Load GIS script
const gisScript = document.createElement('script');
gisScript.src = 'https://accounts.google.com/gsi/client';
gisScript.async = true;
gisScript.defer = true;
gisScript.onload = () => {
    gisLoaded = true;
    checkGisLoaded();
};
document.body.appendChild(gisScript);


const initializeClients = () => {


    tokenClient = window.google.accounts.oauth2.initTokenClient({
        client_id: CLIENT_ID,
        scope: SCOPES,
        callback: (tokenResponse: any) => {
            if (tokenResponse.error) {
                console.error('Authentication error:', tokenResponse.error);
                if (onAuthChange) onAuthChange(true, false);
            }
        },
    });
    
    window.gapi.client.load('youtube', 'v3', () => {
        if(onAuthChange) onAuthChange(true, !!window.gapi.client.getToken());
    });
}

export const initClient = (callback: (isReady: boolean, isLoggedIn: boolean) => void) => {
    onAuthChange = callback;
    if(gapiLoaded && gisLoaded){
       initializeClients();
    }
};

export const signIn = (callback: (isLoggedIn: boolean) => void) => {
    if (!tokenClient) {
        console.error('Token client not initialized');
        callback(false);
        return;
    }

    tokenClient.callback = (resp: any) => {
        if (resp.error) {
            console.error('Sign-in error:', resp.error);
            callback(false);
            return;
        }
        window.gapi.client.setToken(resp);
        callback(true);
    };

    if (window.gapi.client.getToken() === null) {
        tokenClient.requestAccessToken({ prompt: 'consent' });
    } else {
        tokenClient.requestAccessToken({ prompt: '' });
    }
};

export const signOut = () => {
    const token = window.gapi.client.getToken();
    if (token !== null) {
        window.google.accounts.oauth2.revoke(token.access_token, () => {
            window.gapi.client.setToken(null);
        });
    }
};


export const uploadVideo = (
    videoBlob: Blob,
    details: VideoDetails,
    onProgress: (progress: number) => void
): Promise<string> => {
    return new Promise((resolve, reject) => {
       
        
        const metadata = {
            snippet: {
                title: details.title,
                description: details.description,
                tags: details.tags,
            },
            status: {
                privacyStatus: 'private', // 'private', 'public', or 'unlisted'
            },
        };

        const uploader = new (window as any).MediaUploader({
            baseUrl: 'https://www.googleapis.com/upload/youtube/v3/videos',
            file: videoBlob,
            token: window.gapi.client.getToken().access_token,
            metadata: metadata,
            params: {
                part: 'snippet,status',
            },
            onError: (err: any) => reject(new Error(JSON.parse(err).error.message || 'Upload failed.')),
            onProgress: (event: ProgressEvent) => {
                 onProgress(event.loaded / event.total);
            },
            onComplete: (data: any) => {
                const response = JSON.parse(data);
                if (response.id) {
                    resolve(response.id);
                } else {
                    reject(new Error('Upload completed but no video ID was returned.'));
                }
            },
        });
        
        uploader.upload();
    });
};