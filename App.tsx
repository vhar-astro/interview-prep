import React, { useState, useRef } from 'react';
import { useLiveSession } from './hooks/useLiveSession';
import AudioVisualizer from './components/AudioVisualizer';
import { 
  DEFAULT_RESUME_DATA, 
  getInterviewerSystemInstruction, 
  getCandidateSystemInstruction 
} from './constants';
import { parseFile } from './utils/fileUtils';

function App() {
  const { isConnected, isConnecting, volume, connect, disconnect, error: sessionError } = useLiveSession();
  const [showResume, setShowResume] = useState(false);
  const [userRole, setUserRole] = useState<'candidate' | 'interviewer'>('candidate');
  
  // Resume State
  const [resumeText, setResumeText] = useState<string>(DEFAULT_RESUME_DATA);
  const [fileName, setFileName] = useState<string>('Default Sample Profile');
  const [isParsing, setIsParsing] = useState(false);
  const [fileError, setFileError] = useState<string | null>(null);
  
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleStart = () => {
    const instruction = userRole === 'candidate' 
      ? getInterviewerSystemInstruction(resumeText) 
      : getCandidateSystemInstruction(resumeText);
    connect(instruction);
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsParsing(true);
    setFileError(null);

    try {
      const text = await parseFile(file);
      if (text.length < 50) {
         throw new Error("The file appears to be empty or could not be read correctly.");
      }
      setResumeText(text);
      setFileName(file.name);
      // Reset to default sample if they want to switch back? 
      // For now, once uploaded, it stays until refresh or new upload.
    } catch (err: any) {
      console.error("File parsing error:", err);
      setFileError(err.message || "Failed to read file.");
    } finally {
      setIsParsing(false);
      // Clear input value so same file can be selected again if needed
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const triggerFileUpload = () => {
    fileInputRef.current?.click();
  };

  return (
    <div className="min-h-screen bg-slate-900 text-slate-100 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-md bg-slate-800 rounded-2xl shadow-2xl overflow-hidden border border-slate-700 flex flex-col">
        
        {/* Header */}
        <div className="p-6 text-center border-b border-slate-700 bg-slate-850">
          <h1 className="text-2xl font-bold text-sky-400 mb-1">Interview Prep AI</h1>
          <p className="text-slate-400 text-xs truncate max-w-[300px] mx-auto">
            Context: <span className="text-slate-200 font-medium">{fileName}</span>
          </p>
        </div>

        {/* Resume Upload Section */}
        <div className="bg-slate-900/50 p-4 border-b border-slate-700">
           <input 
             type="file" 
             ref={fileInputRef} 
             onChange={handleFileUpload} 
             className="hidden" 
             accept=".pdf,.docx,.txt,.md"
           />
           <div className="flex items-center gap-3">
             <button 
               onClick={triggerFileUpload}
               disabled={isConnected || isConnecting || isParsing}
               className="flex-1 py-2 px-4 bg-slate-700 hover:bg-slate-600 text-slate-200 text-sm font-medium rounded-lg transition-colors flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed"
             >
               {isParsing ? (
                 <span className="animate-pulse">Processing File...</span>
               ) : (
                 <>
                   <svg xmlns="http://www.w3.org/2000/svg" className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                     <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16v1a3 3 0 003 3h10a3 3 0 003-3v-1m-4-8l-4-4m0 0L8 8m4-4v12" />
                   </svg>
                   Upload Resume (PDF/Docx)
                 </>
               )}
             </button>
             {fileName !== 'Default Sample Profile' && !isConnected && !isConnecting && (
               <button
                 onClick={() => {
                   setResumeText(DEFAULT_RESUME_DATA);
                   setFileName('Default Sample Profile');
                 }}
                 className="py-2 px-3 text-xs text-red-400 hover:text-red-300 hover:bg-red-400/10 rounded-lg transition-colors"
                 title="Reset to default resume"
               >
                 Reset
               </button>
             )}
           </div>
           {fileError && <p className="text-xs text-red-400 mt-2 text-center">{fileError}</p>}
        </div>

        {/* Mode Switcher */}
        <div className="px-6 pt-6">
           <div className="flex bg-slate-900 p-1 rounded-xl border border-slate-700">
              <button
                disabled={isConnected || isConnecting}
                onClick={() => setUserRole('candidate')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                   userRole === 'candidate'
                   ? 'bg-slate-700 text-sky-400 shadow-sm'
                   : 'text-slate-500 hover:text-slate-300'
                } ${isConnected || isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                 I am the Candidate
              </button>
              <button
                disabled={isConnected || isConnecting}
                onClick={() => setUserRole('interviewer')}
                className={`flex-1 py-2 rounded-lg text-sm font-medium transition-all ${
                   userRole === 'interviewer'
                   ? 'bg-slate-700 text-sky-400 shadow-sm'
                   : 'text-slate-500 hover:text-slate-300'
                } ${isConnected || isConnecting ? 'opacity-50 cursor-not-allowed' : ''}`}
              >
                 I am the Interviewer
              </button>
           </div>
           <p className="text-center text-xs text-slate-500 mt-2 h-4">
              {userRole === 'candidate' 
                ? "AI will act as the Hiring Manager." 
                : "AI will act as the Candidate."}
           </p>
        </div>

        {/* Visualizer Area */}
        <div className="h-64 flex items-center justify-center bg-gradient-to-b from-slate-800 to-slate-900 relative mt-2">
          <AudioVisualizer volume={volume} isActive={isConnected} />
          
          {/* Status Badge */}
          <div className={`absolute top-4 right-4 px-3 py-1 rounded-full text-xs font-semibold flex items-center gap-2 ${
            isConnected ? 'bg-green-500/20 text-green-400 border border-green-500/30' : 
            isConnecting ? 'bg-yellow-500/20 text-yellow-400 border border-yellow-500/30' :
            'bg-slate-700 text-slate-400 border border-slate-600'
          }`}>
            <span className={`w-2 h-2 rounded-full ${
              isConnected ? 'bg-green-400 animate-pulse' : 
              isConnecting ? 'bg-yellow-400 animate-ping' : 
              'bg-slate-500'
            }`}></span>
            {isConnected ? 'LIVE' : isConnecting ? 'CONNECTING...' : 'OFFLINE'}
          </div>
        </div>

        {/* Controls */}
        <div className="p-8 flex flex-col gap-4 bg-slate-800">
          {sessionError && (
            <div className="bg-red-500/10 border border-red-500/50 text-red-400 px-4 py-2 rounded-lg text-sm text-center">
              {sessionError}
            </div>
          )}

          {!isConnected ? (
            <button
              onClick={handleStart}
              disabled={isConnecting || isParsing}
              className={`w-full py-4 rounded-xl text-lg font-bold shadow-lg transition-all transform active:scale-95 ${
                isConnecting || isParsing
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-sky-500 hover:bg-sky-400 text-white shadow-sky-500/30'
              }`}
            >
              {isConnecting ? 'Initializing...' : userRole === 'candidate' ? 'Start Interview' : 'Start Assessment'}
            </button>
          ) : (
            <button
              onClick={disconnect}
              className="w-full py-4 rounded-xl text-lg font-bold bg-red-500 hover:bg-red-400 text-white shadow-lg shadow-red-500/30 transition-all transform active:scale-95"
            >
              End Session
            </button>
          )}

          <div className="mt-4 text-center">
             <button 
                onClick={() => setShowResume(!showResume)}
                className="text-slate-400 text-sm hover:text-sky-400 underline decoration-dotted underline-offset-4"
             >
                {showResume ? 'Hide Context' : 'View Context'}
             </button>
          </div>
        </div>
      </div>

      {/* Resume Context Panel (Optional View) */}
      {showResume && (
        <div className="w-full max-w-md mt-6 bg-slate-800 rounded-xl border border-slate-700 p-6 shadow-xl animate-fade-in">
           <h3 className="text-sm font-bold text-slate-300 mb-2 uppercase tracking-wider">Loaded Profile Context</h3>
           <pre className="text-xs text-slate-400 whitespace-pre-wrap font-mono h-64 overflow-y-auto bg-slate-900 p-4 rounded-lg border border-slate-700">
             {resumeText}
           </pre>
        </div>
      )}
    </div>
  );
}

export default App;