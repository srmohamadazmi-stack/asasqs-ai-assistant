import React, { useState, useRef, useEffect, useCallback } from 'react';
import { GoogleGenAI, Chat, GenerateContentResponse } from '@google/genai';
import type { Message } from '../types';
import { ChatIcon, CloseIcon, SendIcon, BotIcon, UserIcon, MicrophoneIcon } from './icons';

// Fix: Define SpeechRecognition types to resolve TypeScript errors.
interface SpeechRecognitionAlternative {
  transcript: string;
}

interface SpeechRecognitionResult {
  [index: number]: SpeechRecognitionAlternative;
}

interface SpeechRecognitionResultList {
  [index: number]: SpeechRecognitionResult;
}

interface SpeechRecognitionEvent {
  results: SpeechRecognitionResultList;
}

interface SpeechRecognitionErrorEvent {
  error: string;
}

interface SpeechRecognition {
  continuous: boolean;
  interimResults: boolean;
  lang: string;
  onstart: () => void;
  onend: () => void;
  onresult: (event: SpeechRecognitionEvent) => void;
  onerror: (event: SpeechRecognitionErrorEvent) => void;
  start: () => void;
  stop: () => void;
}

interface SpeechRecognitionStatic {
  new(): SpeechRecognition;
}

// Add SpeechRecognition type to window
declare global {
  interface Window {
    SpeechRecognition: SpeechRecognitionStatic;
    webkitSpeechRecognition: SpeechRecognitionStatic;
  }
}

const ChatWidget: React.FC = () => {
  const [isOpen, setIsOpen] = useState<boolean>(() => {
    try {
      const savedState = sessionStorage.getItem('chatWidgetIsOpen');
      return savedState ? JSON.parse(savedState) : false;
    } catch (e) {
      console.error("Could not read open state from sessionStorage", e);
      return false;
    }
  });

  const [isLoading, setIsLoading] = useState(false);

  const initialMessage: Message = {
      role: 'model',
      content: "Hello! Welcome to ASASQS. I'm your friendly ASAS-QS AI Assistant. How can I help you with our quantity surveying services today?",
  };
  
  const [messages, setMessages] = useState<Message[]>(() => {
    try {
      const savedMessages = sessionStorage.getItem('chatWidgetMessages');
      if (savedMessages) {
        const parsed = JSON.parse(savedMessages);
        if (Array.isArray(parsed) && parsed.length > 0) {
          return parsed;
        }
      }
      return [initialMessage];
    } catch (e) {
      console.error("Could not read messages from sessionStorage", e);
      return [initialMessage];
    }
  });
  
  const [userInput, setUserInput] = useState('');
  const [isRecording, setIsRecording] = useState(false);
  const [isSpeechRecognitionSupported, setIsSpeechRecognitionSupported] = useState(false);
  const chatRef = useRef<Chat | null>(null);
  const recognitionRef = useRef<SpeechRecognition | null>(null);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  useEffect(() => {
    try {
      sessionStorage.setItem('chatWidgetIsOpen', JSON.stringify(isOpen));
    } catch (e) {
      console.error("Failed to save chat open state to sessionStorage", e);
    }
  }, [isOpen]);

  useEffect(() => {
    try {
      sessionStorage.setItem('chatWidgetMessages', JSON.stringify(messages));
    } catch (e) {
      console.error("Failed to save chat messages to sessionStorage", e);
    }
  }, [messages]);

  useEffect(() => {
    const initChat = () => {
      try {
        const ai = new GoogleGenAI({ apiKey: process.env.API_KEY as string });

        const history = messages
          .filter(msg => msg.role === 'user' || msg.role === 'model')
          .map(msg => ({
            role: msg.role as 'user' | 'model',
            parts: [{ text: msg.content }],
          }));
          
        chatRef.current = ai.chats.create({
          model: 'gemini-2.5-flash',
          history: history,
          config: {
            systemInstruction: "You are the ASAS-QS AI Assistant, a friendly and professional customer assistant for ASASQS, a consulting Quantity Surveying firm based in Malaysia with the website www.asasqs.com.my. Your goal is to help users with their questions about ASASQS's services, company profile, and projects. The main services include Pre-Contract Services (like feasibility studies and cost planning), Post-Contract Services (like contract administration and final accounts), and Specialized Services (like due diligence and value engineering). Keep your answers concise, helpful, and polite. Do not make up information if you do not know the answer. If a user asks for a quote or detailed consultation, you should advise them to contact ASASQS directly through the contact information provided on their website.",
            tools: [{googleSearch: {}}],
          },
        });
      } catch (error) {
        console.error("Failed to initialize Gemini chat:", error);
        setMessages((prev) => [...prev, { role: 'error', content: 'Failed to initialize the chat assistant. Please check the API key and configuration.' }]);
      }
    };
    initChat();
    
    const SpeechRecognition = window.SpeechRecognition || window.webkitSpeechRecognition;
    if (SpeechRecognition) {
      setIsSpeechRecognitionSupported(true);
      const recognition = new SpeechRecognition();
      recognition.continuous = false;
      recognition.interimResults = false;
      recognition.lang = 'en-US';

      recognition.onresult = (event) => {
        const transcript = event.results[0][0].transcript;
        setUserInput(prev => (prev ? prev + ' ' : '') + transcript);
      };
      
      recognition.onstart = () => setIsRecording(true);
      recognition.onend = () => setIsRecording(false);
      recognition.onerror = (event) => {
        console.error('Speech recognition error:', event.error);
        if (event.error === 'not-allowed') {
          setMessages(prev => [...prev, {role: 'error', content: 'Microphone access was denied. Please allow it in your browser settings to use voice input.'}]);
        }
        setIsRecording(false);
      };
      recognitionRef.current = recognition;
    } else {
      console.warn('Speech Recognition not supported by this browser.');
    }
  }, []);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(scrollToBottom, [messages]);

  const toggleChat = () => {
    setIsOpen(!isOpen);
  };

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading || !chatRef.current) return;

    const userMessage: Message = { role: 'user', content: userInput };
    setMessages((prev) => [...prev, userMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const response: GenerateContentResponse = await chatRef.current.sendMessage({ message: userInput });
      
      const groundingMetadata = response.candidates?.[0]?.groundingMetadata;
      const sources = groundingMetadata?.groundingChunks
        ?.map(chunk => chunk.web)
        .filter((web): web is { uri: string; title: string } => !!(web?.uri && web.title));

      const modelMessage: Message = {
        role: 'model',
        content: response.text,
        sources: sources && sources.length > 0 ? sources : undefined,
      };
      setMessages((prev) => [...prev, modelMessage]);
    } catch (error) {
      console.error('Gemini API error:', error);
      const errorMessage: Message = { role: 'error', content: 'Sorry, something went wrong. Please try again.' };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  }, [userInput, isLoading]);

  const handleToggleRecording = () => {
    if (!recognitionRef.current) return;
    if (isRecording) {
      recognitionRef.current.stop();
    } else {
      recognitionRef.current.start();
    }
  };

  return (
    <>
      <div className="fixed bottom-5 right-5 z-50">
        <button
          onClick={toggleChat}
          className="bg-blue-600 text-white rounded-full p-4 shadow-lg hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition-transform transform hover:scale-110"
          aria-label="Toggle chat widget"
        >
          {isOpen ? <CloseIcon className="w-8 h-8" /> : <ChatIcon className="w-8 h-8" />}
        </button>
      </div>

      <div
        className={`fixed bottom-24 right-5 w-[calc(100%-2.5rem)] max-w-md h-[70vh] max-h-[600px] bg-white rounded-2xl shadow-2xl flex flex-col transition-all duration-300 ease-in-out z-40 ${
          isOpen ? 'opacity-100 transform translate-y-0' : 'opacity-0 transform translate-y-10 pointer-events-none'
        }`}
      >
        <header className="bg-blue-600 text-white p-4 flex justify-between items-center rounded-t-2xl">
          <h3 className="text-xl font-bold">ASAS-QS AI Assistant</h3>
          <div className="flex items-center gap-2">
            <a
              href="https://www.asasqs.com.my/contact"
              target="_blank"
              rel="noopener noreferrer"
              className="text-sm font-medium hover:bg-blue-700 rounded-md px-3 py-1 transition-colors"
              title="Go to Contact Page"
            >
              Contact Us
            </a>
            <button onClick={toggleChat} aria-label="Close chat">
               <CloseIcon className="w-6 h-6" />
            </button>
          </div>
        </header>

        <div className="flex-1 p-4 overflow-y-auto bg-gray-50">
          <div className="space-y-4">
            {messages.map((msg, index) => (
              <div key={index} className={`flex items-end gap-2 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
                {msg.role === 'model' && <BotIcon className="w-8 h-8 text-blue-600 flex-shrink-0" />}
                <div
                  className={`rounded-2xl p-3 max-w-xs md:max-w-sm ${
                    msg.role === 'user'
                      ? 'bg-blue-500 text-white rounded-br-none'
                      : msg.role === 'model'
                      ? 'bg-gray-200 text-gray-800 rounded-bl-none'
                      : 'bg-red-100 text-red-800 rounded-bl-none'
                  }`}
                >
                  <p className="text-sm whitespace-pre-wrap">{msg.content}</p>
                  {msg.sources && (
                    <div className="mt-3 pt-2 border-t border-gray-300">
                      <h4 className="text-xs font-bold text-gray-600 mb-1">Sources:</h4>
                      <ul className="space-y-1">
                        {msg.sources.map((source, i) => (
                          <li key={i}>
                            <a
                              href={source.uri}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="text-xs text-blue-600 hover:underline truncate block"
                              title={source.title}
                            >
                              {i+1}. {source.title}
                            </a>
                          </li>
                        ))}
                      </ul>
                    </div>
                  )}
                </div>
                 {msg.role === 'user' && <UserIcon className="w-8 h-8 text-gray-400 flex-shrink-0" />}
              </div>
            ))}
            {isLoading && (
              <div className="flex justify-start items-end gap-2">
                 <BotIcon className="w-8 h-8 text-blue-600" />
                <div className="bg-gray-200 text-gray-800 rounded-2xl p-3 rounded-bl-none">
                  <div className="flex items-center space-x-1">
                      <span className="h-2 w-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.3s]"></span>
                      <span className="h-2 w-2 bg-blue-400 rounded-full animate-bounce [animation-delay:-0.15s]"></span>
                      <span className="h-2 w-2 bg-blue-400 rounded-full animate-bounce"></span>
                  </div>
                </div>
              </div>
            )}
            <div ref={messagesEndRef} />
          </div>
        </div>

        <div className="p-4 border-t bg-white rounded-b-2xl">
          <div className="flex items-center gap-2">
            <textarea
              value={userInput}
              onChange={(e) => setUserInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  handleSendMessage();
                }
              }}
              placeholder={isRecording ? 'Listening...' : 'Type your message...'}
              className="flex-1 p-2 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
              rows={1}
            />
            {isSpeechRecognitionSupported && (
              <button
                onClick={handleToggleRecording}
                className={`p-2 rounded-full hover:bg-gray-200 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition ${isRecording ? 'text-red-500' : 'text-gray-500'}`}
                aria-label={isRecording ? 'Stop recording' : 'Start recording'}
              >
                <MicrophoneIcon className="w-6 h-6" />
              </button>
            )}
            <button
              onClick={handleSendMessage}
              disabled={isLoading || !userInput.trim()}
              className="bg-blue-600 text-white p-2 rounded-full hover:bg-blue-700 disabled:bg-blue-300 disabled:cursor-not-allowed focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 transition"
              aria-label="Send message"
            >
              <SendIcon className="w-6 h-6" />
            </button>
          </div>
        </div>
      </div>
    </>
  );
};

export default ChatWidget;