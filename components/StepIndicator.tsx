
import React from 'react';
import type { AppStep } from '../types';
import { ScriptIcon, VideoIcon, UploadIcon } from './icons/Icons';

interface StepIndicatorProps {
  currentStep: AppStep;
}

const steps = [
  { id: 1, name: 'Generate Script', icon: ScriptIcon },
  { id: 2, name: 'Create Video', icon: VideoIcon },
  { id: 3, name: 'Upload to YouTube', icon: UploadIcon },
];

const StepIndicator: React.FC<StepIndicatorProps> = ({ currentStep }) => {
  return (
    <nav aria-label="Progress">
      <ol role="list" className="flex items-center">
        {steps.map((step, stepIdx) => (
          <li key={step.name} className={`relative ${stepIdx !== steps.length - 1 ? 'pr-8 sm:pr-20' : ''} flex-1`}>
            {step.id < currentStep ? (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-brand-primary" />
                </div>
                <div
                  className="relative flex h-8 w-8 items-center justify-center bg-brand-primary rounded-full"
                >
                  <step.icon className="h-5 w-5 text-white" />
                </div>
              </>
            ) : step.id === currentStep ? (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-gray-700" />
                </div>
                <div
                  className="relative flex h-8 w-8 items-center justify-center bg-brand-surface border-2 border-brand-primary rounded-full"
                  aria-current="step"
                >
                  <span className="absolute h-4 w-4 rounded-full bg-brand-primary animate-pulse-fast" />
                  <step.icon className="relative h-5 w-5 text-brand-primary" />
                </div>
              </>
            ) : (
              <>
                <div className="absolute inset-0 flex items-center" aria-hidden="true">
                  <div className="h-0.5 w-full bg-gray-700" />
                </div>
                <div
                  className="group relative flex h-8 w-8 items-center justify-center bg-brand-surface border-2 border-gray-600 rounded-full"
                >
                   <step.icon className="h-5 w-5 text-gray-400" />
                </div>
              </>
            )}
            <span className="absolute top-10 w-max -left-2 text-xs sm:text-sm font-medium text-brand-text-muted">{step.name}</span>
          </li>
        ))}
      </ol>
    </nav>
  );
};

export default StepIndicator;
