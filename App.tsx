import React from 'react';
import { ChatInterface } from './components/ChatInterface';

const App: React.FC = () => {
  return (
    <div className="h-screen w-screen bg-white overflow-hidden">
      <ChatInterface />
    </div>
  );
};

export default App;