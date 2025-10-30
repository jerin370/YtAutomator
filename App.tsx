
import React, { useState } from 'react';
import type { VideoDetails } from './types';
import { AppStep } from './types';
import StepIndicator from './components/StepIndicator';
import ScriptGenerator from './components/ScriptGenerator';
import VideoCreator from './components/VideoCreator';
import YouTubeUploader from './components/YouTubeUploader';

const App: React.FC = () => {
  const [currentStep, setCurrentStep] = useState<AppStep>(AppStep.GENERATE_SCRIPT);
  const [script, setScript] = useState<string>('');
  const [videoDetails, setVideoDetails] = useState<VideoDetails | null>(null);

  const handleScriptGenerated = (generatedScript: string) => {
    setScript(generatedScript);
    setCurrentStep(AppStep.CREATE_VIDEO);
  };

  const handleVideoCreated = (details: VideoDetails) => {
    setVideoDetails(details);
    setCurrentStep(AppStep.UPLOAD_VIDEO);
  };
  
  const handleReset = () => {
    setCurrentStep(AppStep.GENERATE_SCRIPT);
    setScript('');
    setVideoDetails(null);
  }

  const renderStep = () => {
    switch (currentStep) {
      case AppStep.GENERATE_SCRIPT:
        return <ScriptGenerator onScriptGenerated={handleScriptGenerated} />;
      case AppStep.CREATE_VIDEO:
        return <VideoCreator script={script} onVideoCreated={handleVideoCreated} onBack={() => setCurrentStep(AppStep.GENERATE_SCRIPT)} />;
      case AppStep.UPLOAD_VIDEO:
        return videoDetails ? <YouTubeUploader videoDetails={videoDetails} onReset={handleReset} onBack={() => setCurrentStep(AppStep.CREATE_VIDEO)} /> : null;
      default:
        return <ScriptGenerator onScriptGenerated={handleScriptGenerated} />;
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-brand-bg to-gray-900 font-sans p-4 sm:p-6 md:p-8">
      <div className="max-w-4xl mx-auto">
        <header className="text-center mb-8">
          <h1 className="text-4xl sm:text-5xl font-bold text-transparent bg-clip-text bg-gradient-to-r from-blue-400 to-purple-500">
            Content Automator
          </h1>
          <p className="text-brand-text-muted mt-2">AI-powered video creation workflow</p>
        </header>
        
        <main className="bg-brand-surface rounded-xl shadow-2xl p-6 sm:p-8 border border-gray-700/50">
          <StepIndicator currentStep={currentStep} />
          <div className="mt-8">
            {renderStep()}
          </div>
        </main>
      </div>
    </div>
  );
};

export default App;
