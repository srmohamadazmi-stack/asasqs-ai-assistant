
import React from 'react';
import ChatWidget from './components/ChatWidget';

const App: React.FC = () => {
  return (
    <div className="min-h-screen bg-gray-50 flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-4xl text-center">
        <h1 className="text-4xl md:text-6xl font-bold text-gray-800 mb-4">Welcome to Our Website</h1>
        <p className="text-lg md:text-xl text-gray-600 mb-8">
          We're here to help. If you have any questions, feel free to use our new AI-powered customer assistant!
          <br />
          Click the chat icon in the bottom right corner to get started.
        </p>
        <div className="bg-white p-8 rounded-lg shadow-lg">
          <img src="https://picsum.photos/800/400" alt="Placeholder" className="rounded-md w-full h-auto" />
          <h2 className="text-2xl font-semibold text-gray-700 mt-6">Explore Our Services</h2>
          <p className="text-gray-500 mt-2">Discover the amazing features we offer to help you succeed.</p>
        </div>
      </div>
      <ChatWidget />
    </div>
  );
};

export default App;
