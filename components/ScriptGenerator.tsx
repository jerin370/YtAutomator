
import React, { useState } from 'react';
import { generateScript } from '../services/geminiService';
import Loader from './Loader';
import { GenerateIcon } from './icons/Icons';

interface ScriptGeneratorProps {
  onScriptGenerated: (script: string) => void;
}

const ScriptGenerator: React.FC<ScriptGeneratorProps> = ({ onScriptGenerated }) => {
  const [topic, setTopic] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [generatedScript, setGeneratedScript] = useState<string>('');

  const handleGenerate = async () => {
    if (!topic.trim()) {
      setError('Please enter a video topic.');
      return;
    }
    setIsLoading(true);
    setError(null);
    setGeneratedScript('');
    try {
      const script = await generateScript(topic);
      setGeneratedScript(script);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'An unknown error occurred.');
    } finally {
      setIsLoading(false);
    }
  };

  const handleProceed = () => {
    onScriptGenerated(generatedScript);
  };

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold text-brand-text">Step 1: Generate Your Script</h2>
        <p className="text-brand-text-muted mt-1">Start by providing a topic for your video. Our AI will craft an engaging script for you.</p>
      </div>
      
      <div className="flex flex-col sm:flex-row gap-4">
        <input
          type="text"
          value={topic}
          onChange={(e) => setTopic(e.target.value)}
          placeholder="e.g., 'The Future of Renewable Energy'"
          className="flex-grow bg-gray-800 border border-gray-600 text-brand-text rounded-md px-4 py-2 focus:ring-2 focus:ring-brand-primary focus:outline-none transition"
          disabled={isLoading}
        />
        <button
          onClick={handleGenerate}
          disabled={isLoading || !!generatedScript}
          className="flex items-center justify-center gap-2 bg-brand-primary hover:bg-blue-700 disabled:bg-gray-600 text-white font-bold py-2 px-4 rounded-md transition duration-300"
        >
          {isLoading ? <Loader /> : <GenerateIcon />}
          {isLoading ? 'Generating...' : 'Generate Script'}
        </button>
      </div>

      {error && <p className="text-red-400 text-sm">{error}</p>}

      {generatedScript && (
        <div className="bg-gray-800/50 p-4 rounded-lg border border-gray-700 max-h-72 overflow-y-auto">
          <h3 className="text-lg font-semibold mb-2">Generated Script:</h3>
          <pre className="text-sm text-brand-text-muted whitespace-pre-wrap font-sans">{generatedScript}</pre>
        </div>
      )}
      
      {generatedScript && !isLoading && (
        <div className="flex justify-end">
          <button
            onClick={handleProceed}
            className="bg-brand-secondary hover:bg-purple-700 text-white font-bold py-2 px-6 rounded-md transition duration-300"
          >
            Proceed to Video Creation &rarr;
          </button>
        </div>
      )}
    </div>
  );
};

export default ScriptGenerator;
