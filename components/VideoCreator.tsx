import React, { useState, useEffect, useCallback } from 'react';
import type { VisualAsset, VideoDetails } from '../types';
import { generateYouTubeDetails, generateVoiceover, generateStaticVisual } from '../services/geminiService';
import Loader from './Loader';
import { UploadIcon, LightbulbIcon, GenerateIcon } from './icons/Icons';

interface VideoCreatorProps {
  script: string;
  onVideoCreated: (details: VideoDetails) => void;
  onBack: () => void;
}

const voiceOptions = [
    { id: 'Kore', name: 'Kore (Female)' },
    { id: 'Puck', name: 'Puck (Male)' },
    { id: 'Charon', name: 'Charon (Male)' },
    { id: 'Zephyr', name: 'Zephyr (Female)' },
];

const VideoCreator: React.FC<VideoCreatorProps> = ({ script, onVideoCreated, onBack }) => {
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [tags, setTags] = useState<string[]>([]);
  const [imagePrompts, setImagePrompts] = useState<string[]>([]);
  const [visuals, setVisuals] = useState<VisualAsset[]>([]);
  const [selectedVoice, setSelectedVoice] = useState(voiceOptions[0].id);
  const [audioDataUrl, setAudioDataUrl] = useState<string | null>(null);
  
  const [isLoadingDetails, setIsLoadingDetails] = useState(true);
  const [isCreating, setIsCreating] = useState(false);
  const [creationStatus, setCreationStatus] = useState('');
  const [error, setError] = useState<string | null>(null);

  const fetchDetails = useCallback(async () => {
    try {
      const details = await generateYouTubeDetails(script);
      setTitle(details.title);
      setDescription(details.description);
      setTags(details.tags);
      setImagePrompts(details.imagePrompts);
    } catch (err) {
      setError('Could not fetch video details from AI.');
    } finally {
      setIsLoadingDetails(false);
    }
  }, [script]);

  useEffect(() => {
    fetchDetails();
  }, [fetchDetails]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const filesArray = Array.from(e.target.files);
      const newVisuals: VisualAsset[] = [];
      let filesProcessed = 0;

      filesArray.forEach((file: File) => {
        const reader = new FileReader();
        reader.onloadend = () => {
          newVisuals.push({ name: file.name, dataUrl: reader.result as string });
          filesProcessed++;
          if (filesProcessed === filesArray.length) {
            setVisuals(prev => [...prev, ...newVisuals]);
          }
        };
        reader.readAsDataURL(file);
      });
    }
  };

  const handleCreateVideo = async () => {
    setIsCreating(true);
    setError(null);
    setCreationStatus('Starting...');

    try {
      let finalVisuals: VisualAsset[] = [...visuals];

      if (finalVisuals.length === 0 && imagePrompts.length > 0) {
        for (let i = 0; i < imagePrompts.length; i++) {
          const prompt = imagePrompts[i];
          setCreationStatus(`Generating image ${i + 1}/${imagePrompts.length}...`);
          
          const visualDataUrl = await generateStaticVisual(prompt);
          
          const newVisual: VisualAsset = {
            name: `AI: ${prompt.substring(0, 25)}...`,
            dataUrl: visualDataUrl,
          };
          finalVisuals.push(newVisual);
          setVisuals(prev => [...prev, newVisual]);
        }
      }

      if (finalVisuals.length === 0) {
        throw new Error("No visuals were uploaded or could be generated. Cannot proceed.");
      }

      setCreationStatus('Generating voiceover...');
      
      const narrationParts = script.match(/"(.*?)"/g);
      
      if (!narrationParts || narrationParts.length === 0) {
        throw new Error("Could not find any narration text in double quotes. The script may not be in the expected format.");
      }
      
      // Extract the content from the quotes and join them into a single script for the voiceover.
      const narrationScript = narrationParts.map(part => part.substring(1, part.length - 1)).join(' \n');
      
      const generatedAudio = await generateVoiceover(narrationScript, selectedVoice);
      setAudioDataUrl(generatedAudio);

      setCreationStatus('Finalizing...');
      onVideoCreated({
        title,
        description,
        tags,
        visuals: finalVisuals,
        voice: selectedVoice,
        audioDataUrl: generatedAudio,
        script,
      });
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Failed to create video.';
      setError(errorMessage);
    } finally {
      setIsCreating(false);
      setCreationStatus('');
    }
  };

  if (isLoadingDetails) {
    return <div className="flex justify-center items-center h-40"><Loader /> <span className="ml-2">AI is analyzing script...</span></div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-brand-text">Step 2: Create Your Video</h2>
        <p className="text-brand-text-muted mt-1">Add visuals and generate an AI voiceover. If you don't add visuals, we'll generate AI images for you!</p>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
        <div className="space-y-4">
            <h3 className="font-semibold text-lg">Script & Visuals</h3>
            <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 max-h-40 overflow-y-auto">
                <p className="text-sm text-brand-text-muted whitespace-pre-wrap font-sans">{script}</p>
            </div>
            <div className="bg-blue-900/20 border border-blue-500/30 p-4 rounded-lg">
                <h4 className="font-semibold flex items-center gap-2"><LightbulbIcon /> AI Visual Suggestions</h4>
                <ul className="list-disc list-inside text-sm text-blue-300/80 mt-2 space-y-1">
                    {imagePrompts.map((prompt, i) => <li key={i}>{prompt}</li>)}
                </ul>
            </div>
             <div>
                <label className="block text-sm font-medium text-brand-text-muted mb-2">Upload Visuals (Optional)</label>
                <div className="mt-1 flex justify-center px-6 pt-5 pb-6 border-2 border-gray-600 border-dashed rounded-md">
                    <div className="space-y-1 text-center">
                        <UploadIcon className="mx-auto h-12 w-12 text-gray-500" />
                        <div className="flex text-sm text-gray-400">
                            <label htmlFor="file-upload" className="relative cursor-pointer bg-brand-surface rounded-md font-medium text-brand-primary hover:text-blue-400 focus-within:outline-none focus-within:ring-2 focus-within:ring-offset-2 focus-within:ring-offset-gray-800 focus-within:ring-brand-primary">
                                <span>Upload files</span>
                                <input id="file-upload" name="file-upload" type="file" className="sr-only" multiple accept="image/*,video/*" onChange={handleFileChange} />
                            </label>
                            <p className="pl-1">or drag and drop</p>
                        </div>
                        <p className="text-xs text-gray-500">Images or Video files</p>
                    </div>
                </div>
            </div>
            {visuals.length > 0 && (
                <div className="space-y-2">
                    <h4 className="font-semibold text-sm">Visual Assets:</h4>
                    <div className="flex flex-wrap gap-2">
                    {visuals.map((v, i) => {
                        const isVideo = v.dataUrl.startsWith('data:video/');
                        return (
                            <div key={i} className="relative w-24 h-24 rounded-md overflow-hidden bg-black group">
                                {isVideo ? (
                                    <video src={v.dataUrl} autoPlay loop muted className="h-full w-full object-cover" />
                                ) : (
                                    <img src={v.dataUrl} alt={v.name} className="h-full w-full object-cover" />
                                )}
                                <div className="absolute inset-0 bg-black/50 flex items-center justify-center p-2 text-center">
                                     <p className="text-white font-semibold text-xs leading-tight line-clamp-3">{title}</p>
                                </div>
                            </div>
                        );
                    })}
                    </div>
                </div>
            )}
        </div>

        <div className="space-y-4">
            <h3 className="font-semibold text-lg">Voice & Details</h3>
            <div>
                <label htmlFor="voice" className="block text-sm font-medium text-brand-text-muted">Select AI Voice</label>
                <select id="voice" value={selectedVoice} onChange={(e) => setSelectedVoice(e.target.value)} className="mt-1 block w-full pl-3 pr-10 py-2 bg-gray-800 border-gray-600 border rounded-md focus:outline-none focus:ring-brand-primary focus:border-brand-primary sm:text-sm">
                    {voiceOptions.map(opt => <option key={opt.id} value={opt.id}>{opt.name}</option>)}
                </select>
            </div>
            {audioDataUrl && (
                <div>
                    <label className="block text-sm font-medium text-brand-text-muted">Voiceover Preview</label>
                    <audio controls src={audioDataUrl} className="w-full mt-1"></audio>
                </div>
            )}
            <div>
                <label htmlFor="title" className="block text-sm font-medium text-brand-text-muted">Video Title</label>
                <input type="text" id="title" value={title} onChange={(e) => setTitle(e.target.value)} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:ring-brand-primary focus:border-brand-primary sm:text-sm" />
            </div>
            <div>
                <label htmlFor="description" className="block text-sm font-medium text-brand-text-muted">Description</label>
                <textarea id="description" value={description} onChange={(e) => setDescription(e.target.value)} rows={4} className="mt-1 block w-full bg-gray-800 border-gray-600 rounded-md shadow-sm py-2 px-3 focus:ring-brand-primary focus:border-brand-primary sm:text-sm"></textarea>
            </div>
        </div>
      </div>
      
      {error && (
        <div className="bg-red-900/30 border border-red-500/50 p-4 rounded-lg mt-4 text-center">
            <h4 className="font-semibold text-red-300">Generation Failed</h4>
            <p className="text-red-400 text-sm mt-1">{error}</p>
        </div>
      )}
      
      <div className="flex justify-between items-center mt-6">
        <button
          onClick={onBack}
          className="text-brand-text-muted hover:text-brand-text font-medium py-2 px-4 rounded-md transition duration-300"
        >
          &larr; Back to Script
        </button>
        <div className="flex items-center gap-4">
            <button
              onClick={handleCreateVideo}
              disabled={isCreating}
              className="flex items-center justify-center gap-2 bg-brand-secondary hover:bg-purple-700 disabled:bg-gray-600 text-white font-bold py-2 px-6 rounded-md transition duration-300 min-w-[180px]"
            >
              {isCreating ? <Loader /> : <GenerateIcon />}
              {isCreating ? creationStatus : 'Generate & Proceed'}
            </button>
        </div>
      </div>
    </div>
  );
};

export default VideoCreator;