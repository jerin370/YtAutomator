import React, { useState, useEffect, useRef } from 'react';
import type { VideoDetails, VisualAsset } from '../types';
import { UploadCloudIcon, CheckCircleIcon, ReplayIcon, DownloadIcon, GoogleIcon } from './icons/Icons';
import Loader from './Loader';
import { initClient, signIn, signOut, uploadVideo } from '../services/youtubeService';

interface YouTubeUploaderProps {
  videoDetails: VideoDetails;
  onReset: () => void;
  onBack: () => void;
}

type Caption = {
    text: string;
    start: number;
    end: number;
};

const generateCaptions = (script: string, audioUrl: string): Promise<Caption[]> => {
    return new Promise((resolve, reject) => {
        const audio = new Audio(audioUrl);
        audio.onloadedmetadata = () => {
            const duration = audio.duration;
            if (!isFinite(duration) || duration === 0) {
                return reject(new Error("Invalid audio duration for caption generation."));
            }

            const narrationParts = script.match(/"(.*?)"/g);
            if (!narrationParts) {
                return resolve([]);
            }

            const fullNarration = narrationParts.map(part => part.substring(1, part.length - 1)).join(' ').trim();
            
            const sentences = fullNarration.split(/(?<=[.!?])\s+/).filter(s => s.trim());

            if (sentences.length === 0 && fullNarration.length > 0) {
                sentences.push(fullNarration);
            }

            if (sentences.length === 0) {
                return resolve([]);
            }

            const totalLength = sentences.reduce((acc, s) => acc + s.length, 0);
            if (totalLength === 0) {
                 return resolve([]);
            }
            const charsPerSecond = totalLength / duration;
            
            const captions: Caption[] = [];
            let currentTime = 0;

            sentences.forEach(sentence => {
                const sentenceDuration = sentence.length / charsPerSecond;
                captions.push({
                    text: sentence.trim(),
                    start: currentTime,
                    end: currentTime + sentenceDuration,
                });
                currentTime += sentenceDuration;
            });
            
            resolve(captions);
        };
        audio.onerror = () => reject(new Error("Failed to load audio for caption generation."));
        audio.src = audioUrl;
        audio.load();
    });
};


const createVideoBlob = (visuals: VisualAsset[], audioDataUrl: string, captions: Caption[]): Promise<Blob> => {
    return new Promise(async (resolve, reject) => {
        const canvas = document.createElement('canvas');
        canvas.width = 1280;
        canvas.height = 720;
        const ctx = canvas.getContext('2d');
        if (!ctx) return reject(new Error("Cannot get canvas context"));

        const audio = new Audio(audioDataUrl);
        
        const onAudioLoad = async () => {
            try {
                const duration = audio.duration;
                if (!isFinite(duration) || duration === 0) {
                    return reject(new Error("Invalid audio duration."));
                }
                const slideDuration = duration / visuals.length;

                const mediaElements = await Promise.all(visuals.map(v => new Promise<HTMLVideoElement | HTMLImageElement>((res, rej) => {
                    const isVideo = v.dataUrl.startsWith('data:video/');
                    if (isVideo) {
                        const video = document.createElement('video');
                        video.crossOrigin = "anonymous";
                        video.muted = true;
                        video.onloadeddata = () => res(video);
                        video.onerror = (e) => rej(new Error(`Failed to load visual: ${v.name}`));
                        video.src = v.dataUrl;
                        video.load();
                    } else {
                        const img = new Image();
                        img.crossOrigin = "anonymous";
                        img.onload = () => res(img);
                        img.onerror = () => rej(new Error(`Failed to load visual: ${v.name}`));
                        img.src = v.dataUrl;
                    }
                })));

                const videoStream = canvas.captureStream(30);
                
                const audioContext = new AudioContext();
                const audioSource = audioContext.createMediaElementSource(audio);
                const audioDestination = audioContext.createMediaStreamDestination();
                audioSource.connect(audioDestination);
                videoStream.addTrack(audioDestination.stream.getAudioTracks()[0]);

                const recorder = new MediaRecorder(videoStream, { mimeType: 'video/webm' });
                const chunks: Blob[] = [];
                recorder.ondataavailable = e => e.data.size > 0 && chunks.push(e.data);
                recorder.onstop = () => resolve(new Blob(chunks, { type: 'video/webm' }));
                recorder.onerror = e => reject(e);

                recorder.start();
                audio.play().catch(e => reject(new Error("Audio playback failed to start.")));

                let frame = 0;
                const totalFrames = Math.ceil(duration * 30);
                let currentVisualIndex = -1;
                
                let lastCaptionText = '';
                let captionFadeInFrames = 0;
                const FADE_DURATION_FRAMES = 15; // 0.5 seconds at 30fps
                
                const renderInterval = setInterval(() => {
                    if (frame > totalFrames) {
                        clearInterval(renderInterval);
                        if (recorder.state === 'recording') recorder.stop();
                        mediaElements.forEach(m => {
                           if (m instanceof HTMLVideoElement) m.pause();
                        });
                        audioContext.close();
                        return;
                    }
                    
                    const currentTime = frame / 30;
                    const visualIndex = Math.min(Math.floor(currentTime / slideDuration), mediaElements.length - 1);

                    if (visualIndex !== currentVisualIndex) {
                        const prevMedia = mediaElements[currentVisualIndex];
                        if (prevMedia instanceof HTMLVideoElement) {
                            prevMedia.pause();
                            prevMedia.currentTime = 0;
                        }
                        
                        currentVisualIndex = visualIndex;
                        const currentMedia = mediaElements[currentVisualIndex];
                        if (currentMedia instanceof HTMLVideoElement) {
                           currentMedia.play().catch(e => console.warn("Visual playback failed", e));
                        }
                    }

                    const media = mediaElements[visualIndex];
                    ctx.fillStyle = 'black';
                    ctx.fillRect(0, 0, canvas.width, canvas.height);
                    
                    if (media) {
                        const mediaWidth = (media instanceof HTMLVideoElement) ? media.videoWidth : media.naturalWidth;
                        const mediaHeight = (media instanceof HTMLVideoElement) ? media.videoHeight : media.naturalHeight;

                        if (mediaWidth > 0) {
                            const hRatio = canvas.width / mediaWidth;
                            const vRatio = canvas.height / mediaHeight;
                            const ratio = Math.max(hRatio, vRatio); // Use max to fill (cover) the 16:9 frame
                            const centerShift_x = (canvas.width - mediaWidth * ratio) / 2;
                            const centerShift_y = (canvas.height - mediaHeight * ratio) / 2;
                            ctx.drawImage(media, 0, 0, mediaWidth, mediaHeight, centerShift_x, centerShift_y, mediaWidth * ratio, mediaHeight * ratio);
                        }
                    }
                    
                    const activeCaption = captions.find(c => currentTime >= c.start && currentTime < c.end);
                    const currentCaptionText = activeCaption?.text || '';

                    if (currentCaptionText !== lastCaptionText) {
                        captionFadeInFrames = FADE_DURATION_FRAMES;
                        lastCaptionText = currentCaptionText;
                    }

                    if (currentCaptionText) {
                        ctx.save();
                        if (captionFadeInFrames > 0) {
                            const opacity = 1 - (captionFadeInFrames / FADE_DURATION_FRAMES);
                            ctx.globalAlpha = opacity * opacity; // Ease in effect
                            captionFadeInFrames--;
                        } else {
                            ctx.globalAlpha = 1;
                        }

                        const fontSize = 48;
                        ctx.font = `bold ${fontSize}px Arial`;
                        ctx.textAlign = 'center';
                        ctx.textBaseline = 'bottom';

                        const padding = 10;
                        const maxWidth = canvas.width * 0.9;

                        const words = currentCaptionText.split(' ');
                        const lines: string[] = [];
                        let currentLine = '';

                        words.forEach(word => {
                            const testLine = currentLine ? `${currentLine} ${word}` : word;
                            const metrics = ctx.measureText(testLine);
                            if (metrics.width > maxWidth && currentLine) {
                                lines.push(currentLine);
                                currentLine = word;
                            } else {
                                currentLine = testLine;
                            }
                        });
                        lines.push(currentLine);

                        const lineHeight = fontSize * 1.2;
                        lines.reverse().forEach((line, index) => {
                            const y = canvas.height - (index * lineHeight) - 20;

                            const textMetrics = ctx.measureText(line);
                            const bgWidth = textMetrics.width + padding * 2;
                            const bgHeight = fontSize + padding;
                            const bgX = (canvas.width - bgWidth) / 2;
                            const bgY = y - fontSize - (padding/2);

                            ctx.fillStyle = 'rgba(0, 0, 0, 0.6)';
                            ctx.fillRect(bgX, bgY, bgWidth, bgHeight);

                            ctx.fillStyle = 'white';
                            ctx.fillText(line, canvas.width / 2, y);
                        });
                        ctx.restore();
                    }
                    
                    frame++;
                }, 1000 / 30);
                
            } catch (err) {
                reject(err);
            }
        };

        audio.addEventListener('loadedmetadata', onAudioLoad);
        audio.addEventListener('error', () => reject(new Error("Failed to load audio metadata.")));
        audio.load();
    });
};

const YouTubeUploader: React.FC<YouTubeUploaderProps> = ({ videoDetails, onReset, onBack }) => {
  const [isUploading, setIsUploading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);
  const [uploadedVideoId, setUploadedVideoId] = useState<string | null>(null);
  
  const [isDownloading, setIsDownloading] = useState(false);
  const [downloadError, setDownloadError] = useState<string | null>(null);

  const [captions, setCaptions] = useState<Caption[]>([]);
  const [currentCaption, setCurrentCaption] = useState<string>('');
  const [currentVisualIndex, setCurrentVisualIndex] = useState(0);
  const audioRef = useRef<HTMLAudioElement>(null);

  const [isClientReady, setIsClientReady] = useState(false);
  const [isLoggedIn, setIsLoggedIn] = useState(false);

  useEffect(() => {
    initClient((ready, loggedIn) => {
        setIsClientReady(ready);
        setIsLoggedIn(loggedIn);
    });
  }, []);

  useEffect(() => {
      if (videoDetails.audioDataUrl && videoDetails.script) {
          generateCaptions(videoDetails.script, videoDetails.audioDataUrl)
              .then(setCaptions)
              .catch(err => {
                  console.error("Failed to generate captions for preview:", err);
                  setCurrentCaption(videoDetails.title);
              });
      }
  }, [videoDetails.script, videoDetails.audioDataUrl, videoDetails.title]);
  
  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;

    const updateVisualAndCaption = () => {
      const time = audio.currentTime;

      if (isFinite(audio.duration) && videoDetails.visuals.length > 0) {
          const slideDuration = audio.duration / videoDetails.visuals.length;
          const newIndex = Math.min(
            Math.floor(time / slideDuration),
            videoDetails.visuals.length - 1
          );
          setCurrentVisualIndex(currentIndex => newIndex !== currentIndex ? newIndex : currentIndex);
      }
      
      if (captions.length > 0) {
          const activeCaption = captions.find(c => time >= c.start && time < c.end);
          const newCaptionText = activeCaption ? activeCaption.text : '';
          setCurrentCaption(current => current !== newCaptionText ? newCaptionText : current);
      }
    };

    const resetState = () => {
      setCurrentVisualIndex(0);
      setCurrentCaption(captions[0]?.text || '');
    };

    audio.addEventListener('timeupdate', updateVisualAndCaption);
    audio.addEventListener('ended', resetState);
    audio.addEventListener('play', updateVisualAndCaption);
    
    return () => {
      audio.removeEventListener('timeupdate', updateVisualAndCaption);
      audio.removeEventListener('ended', resetState);
      audio.removeEventListener('play', updateVisualAndCaption);
    };
  }, [videoDetails.visuals, captions]);

  const handleSignIn = () => {
    signIn((loggedIn) => setIsLoggedIn(loggedIn));
  };
  
  const handleSignOut = () => {
    signOut();
    setIsLoggedIn(false);
  };
  
  const handleUpload = async () => {
    if (!videoDetails.audioDataUrl || videoDetails.visuals.length === 0) {
        setUploadError("Both audio and at least one visual are required to create a video.");
        return;
    }
    
    setIsUploading(true);
    setUploadError(null);
    setDownloadError(null);
    setUploadProgress(0);

    try {
        const generatedCaptions = await generateCaptions(videoDetails.script, videoDetails.audioDataUrl);
        const blob = await createVideoBlob(videoDetails.visuals, videoDetails.audioDataUrl, generatedCaptions);
        
        const videoId = await uploadVideo(blob, videoDetails, (progress) => {
             setUploadProgress(progress * 100);
        });

        setUploadedVideoId(videoId);
        setUploadSuccess(true);

    } catch(err) {
        console.error("Upload failed:", err);
        setUploadError(err instanceof Error ? err.message : "An unknown error occurred during upload.");
    } finally {
        setIsUploading(false);
    }
  };
  
  const handleDownload = async () => {
    if (!videoDetails.audioDataUrl || videoDetails.visuals.length === 0) {
        setDownloadError("Both audio and at least one visual are required to create a video.");
        return;
    }
    setIsDownloading(true);
    setDownloadError(null);
    setUploadError(null);

    try {
        const generatedCaptions = await generateCaptions(videoDetails.script, videoDetails.audioDataUrl);
        const blob = await createVideoBlob(videoDetails.visuals, videoDetails.audioDataUrl, generatedCaptions);
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = `${videoDetails.title.replace(/[^a-zA-Z0-9]/g, '_') || 'video'}.webm`;
        document.body.appendChild(a);
        a.click();
        URL.revokeObjectURL(url);
        document.body.removeChild(a);
    } catch (err) {
        console.error("Video creation failed:", err);
        setDownloadError(err instanceof Error ? err.message : "Failed to create video file.");
    } finally {
        setIsDownloading(false);
    }
  };
  
  const currentVisual = videoDetails.visuals[currentVisualIndex];
  const isCurrentVisualVideo = currentVisual?.dataUrl.startsWith('data:video/');
  const captionOrTitle = currentCaption || (captions.length === 0 ? videoDetails.title : '');

  if (uploadSuccess) {
    return (
        <div className="text-center p-8 bg-green-900/20 border border-green-500/30 rounded-lg">
            <CheckCircleIcon className="h-16 w-16 text-green-400 mx-auto mb-4" />
            <h2 className="text-2xl font-semibold text-white">Upload Successful!</h2>
            <p className="text-green-300/80 mt-2">Your video has been successfully uploaded to your YouTube channel.</p>
            <div className="mt-4 text-sm bg-brand-surface p-3 rounded-md">
                <p className="text-brand-text-muted">View your video at:</p>
                <a 
                    href={`https://www.youtube.com/watch?v=${uploadedVideoId}`} 
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-brand-primary font-mono break-all hover:underline"
                >
                    https://www.youtube.com/watch?v={uploadedVideoId}
                </a>
            </div>
             <button
                onClick={onReset}
                className="mt-6 flex items-center justify-center gap-2 bg-brand-primary hover:bg-blue-700 text-white font-bold py-2 px-4 rounded-md transition duration-300"
            >
                <ReplayIcon />
                Create Another Video
            </button>
        </div>
    );
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-brand-text">Step 3: Upload to YouTube</h2>
        <p className="text-brand-text-muted mt-1">Review your video, then sign in with Google to upload it to your channel.</p>
      </div>
      
      <div className="flex flex-col md:flex-row gap-8 bg-gray-800/50 p-6 rounded-lg border border-gray-700">
        <div className="md:w-1/3 flex-shrink-0">
          <h3 className="font-semibold mb-2">Video Preview</h3>
          <div className="aspect-video bg-black rounded-lg overflow-hidden relative">
            {currentVisual ? (
              isCurrentVisualVideo ? (
                <video 
                  src={currentVisual.dataUrl} 
                  className="w-full h-full object-cover" 
                  key={currentVisualIndex}
                  autoPlay
                  loop
                  muted
                />
              ) : (
                 <img 
                  src={currentVisual.dataUrl} 
                  alt={currentVisual.name}
                  className="w-full h-full object-cover" 
                />
              )
            ) : (
                <div className="w-full h-full bg-gray-900 flex items-center justify-center text-brand-text-muted">
                    No visuals loaded
                </div>
            )}
            <div className="absolute bottom-0 left-0 right-0 p-4 pointer-events-none">
                <div className="text-center">
                   {captionOrTitle && (
                    <span 
                      key={captionOrTitle}
                      className="px-4 py-2 bg-black/60 text-white text-lg font-bold rounded-lg shadow-lg animate-fade-in" 
                      style={{ boxDecorationBreak: 'clone', WebkitBoxDecorationBreak: 'clone' }}
                    >
                        {captionOrTitle}
                    </span>
                   )}
                </div>
            </div>
          </div>
          {videoDetails.audioDataUrl && 
            <audio ref={audioRef} controls src={videoDetails.audioDataUrl} className="w-full mt-4"></audio>
          }
        </div>
        <div className="flex-grow space-y-4">
           <div>
                <label className="block text-sm font-medium text-brand-text-muted">Title</label>
                <p className="text-brand-text font-semibold">{videoDetails.title}</p>
            </div>
            <div>
                <label className="block text-sm font-medium text-brand-text-muted">Description</label>
                <p className="text-brand-text text-sm">{videoDetails.description}</p>
            </div>
             <div>
                <label className="block text-sm font-medium text-brand-text-muted">Tags</label>
                <div className="flex flex-wrap gap-2 mt-1">
                    {videoDetails.tags.map(tag => (
                        <span key={tag} className="px-2 py-1 bg-brand-secondary/20 text-brand-secondary/90 text-xs font-medium rounded-full">{tag}</span>
                    ))}
                </div>
            </div>
        </div>
      </div>
      
      {(downloadError || uploadError) && <p className="text-red-400 text-sm mt-2 text-center">{downloadError || uploadError}</p>}

      {isUploading && (
        <div className="space-y-2 mt-4">
            <div className="flex justify-between mb-1">
                <span className="text-base font-medium text-brand-primary">Uploading...</span>
                <span className="text-sm font-medium text-brand-primary">{uploadProgress.toFixed(0)}%</span>
            </div>
            <div className="w-full bg-gray-700 rounded-full h-2.5">
                <div className="bg-brand-primary h-2.5 rounded-full transition-all duration-300" style={{width: `${uploadProgress}%`}}></div>
            </div>
        </div>
      )}

      <div className="flex justify-between items-center mt-6">
        <button
          onClick={onBack}
          disabled={isUploading || isDownloading}
          className="text-brand-text-muted hover:text-brand-text font-medium py-2 px-4 rounded-md transition duration-300 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          &larr; Back to Video Details
        </button>
        <div className="flex items-center gap-4">
          <button
            onClick={handleDownload}
            disabled={isUploading || isDownloading}
            className="flex items-center justify-center gap-2 bg-green-600 hover:bg-green-700 disabled:bg-gray-600 text-white font-bold py-3 px-4 rounded-md transition duration-300"
          >
            {isDownloading ? <Loader /> : <DownloadIcon />}
            {isDownloading ? 'Generating...' : 'Download Video'}
          </button>
          
          { !isLoggedIn ? (
            <button
                onClick={handleSignIn}
                disabled={!isClientReady || isUploading || isDownloading}
                className="flex items-center justify-center gap-2 bg-white hover:bg-gray-200 disabled:bg-gray-400 text-gray-800 font-bold py-3 px-6 rounded-md transition duration-300 relative group"
                title={!isClientReady ? "Google Client is initializing..." : "Sign in to upload"}
            >
                <GoogleIcon />
                Sign in to Upload
            </button>
          ) : (
            <div className="flex items-center gap-4">
                <button
                    onClick={handleSignOut}
                    className="text-sm text-brand-text-muted hover:text-white"
                >
                    Sign Out
                </button>
                <button
                    onClick={handleUpload}
                    disabled={isUploading || isDownloading}
                    className="flex items-center justify-center gap-2 w-full sm:w-auto bg-red-600 hover:bg-red-700 disabled:bg-gray-600 text-white font-bold py-3 px-6 rounded-md transition duration-300"
                >
                    <UploadCloudIcon />
                    Upload to YouTube
                </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default YouTubeUploader;