import React, { useState, useRef, useEffect } from 'react';
import { agent } from '../services/geminiAgent';
import { useStore } from '../store';
import { ChatMessage, FlightSchedule } from '../types';
import ReactMarkdown from 'react-markdown';
import { motion, AnimatePresence } from 'framer-motion';

// --- Constants ---
const SUGGESTIONS_START = [
  { label: "Arrival Service", prompt: "I want to book Arrival Service." },
  { label: "Departure Service", prompt: "I want to book Departure Service." },
  { label: "Bundle (Arr + Dep)", prompt: "I want to book an Arrival and Departure Bundle." },
];

const SUGGESTIONS_AIRPORT = [
  { label: "Club Mobay (SIA)", prompt: "Club Mobay (SIA)" },
  { label: "Club Kingston (NMIA)", prompt: "Club Kingston (NMIA)" },
];

const SUGGESTIONS_PAX = [
  { label: "1 Adult", prompt: "1 Adult" },
  { label: "2 Adults", prompt: "2 Adults" },
  { label: "2 Adults, 1 Child", prompt: "2 Adults, 1 Child" },
];

const SUGGESTIONS_CONFIRM = [
  { label: "Yes, proceed", prompt: "Yes, proceed" },
  { label: "No, change details", prompt: "No, I need to change details" },
];

// --- Components ---

const QuickReplyChips: React.FC<{ options: {label: string, prompt: string}[], onSelect: (p: string) => void }> = ({ options, onSelect }) => (
    <motion.div 
        initial={{ opacity: 0, y: 10 }}
        animate={{ opacity: 1, y: 0 }}
        className="flex gap-2 overflow-x-auto pb-4 pt-2 scrollbar-hide px-4 md:px-0"
    >
        {options.map((opt, i) => (
            <button
                key={i}
                onClick={() => onSelect(opt.prompt)}
                className="whitespace-nowrap px-6 py-3 bg-white border border-black text-black hover:bg-black hover:text-white rounded-full text-sm font-medium transition-colors duration-200 shadow-sm"
            >
                {opt.label}
            </button>
        ))}
    </motion.div>
);

const FlightCard: React.FC<{ flight: FlightSchedule; direction: 'A'|'D'|null; onSelect: (id: string) => void }> = ({ flight, direction, onSelect }) => {
  return (
    <motion.div
      initial={{ opacity: 0, scale: 0.95 }}
      animate={{ opacity: 1, scale: 1 }}
      whileHover={{ scale: 1.02 }}
      onClick={() => onSelect(String(flight.scheduleId))} 
      className="w-full bg-white rounded-xl p-5 border border-gray-200 mb-3 cursor-pointer hover:border-black hover:shadow-lg transition-all group"
    >
      <div className="flex justify-between items-start">
        <div className="flex items-center gap-4">
            <div className={`bg-black text-white p-3 rounded-lg`}>
                <span className="material-symbols-rounded">
                    {direction === 'A' ? 'flight_land' : 'flight_takeoff'}
                </span>
            </div>
            <div>
                <h4 className="font-bold text-lg text-black">{flight.flightId}</h4>
                <p className="text-gray-500 text-xs uppercase tracking-wider">{flight.airline}</p>
            </div>
        </div>
        <div className="text-right">
            <span className="block font-mono text-sm text-black">{flight.targetDate.split(' ')[1]} {flight.targetDate.split(' ')[2]}</span>
            <span className="block text-xs text-gray-400">{flight.targetDate.split(' ')[0]}</span>
        </div>
      </div>
      <div className="mt-4 flex items-center justify-between border-t border-gray-100 pt-3">
         <span className="text-xs text-gray-400">Flight #{flight.flightNumber}</span>
         <span className="text-xs font-bold text-black group-hover:underline">
            Select for {direction === 'A' ? 'Arrival' : 'Departure'}
         </span>
      </div>
    </motion.div>
  );
};

const SummaryCard: React.FC<{ data: any }> = ({ data }) => {
    const item = data.cartitemids[0];
    return (
        <div className="bg-black text-white rounded-t-[30px] p-8 shadow-2xl mt-auto w-full md:w-[450px] mx-auto border-t border-gray-800">
            <div className="flex justify-between items-center mb-8 border-b border-gray-800 pb-6">
                <div>
                    <span className="text-xs text-gray-400 uppercase tracking-widest block mb-1">Total Due</span>
                    <span className="text-4xl font-light font-mono">${item.retail.toFixed(2)}</span>
                </div>
                <div className="text-right">
                    <span className="text-xs text-gray-400 uppercase tracking-widest block mb-1">Product</span>
                    <span className="text-sm font-bold bg-white text-black px-2 py-1 rounded-md">{item.productid}</span>
                </div>
            </div>
            
            <div className="space-y-4 mb-8">
                <div className="flex justify-between text-sm">
                    <span className="text-gray-400">Passengers</span>
                    <span className="font-medium">{item.adulttickets} Adt, {item.childtickets} Chd</span>
                </div>
                {item.arrivalschedule && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Arrival Flight</span>
                        <span className="font-medium">{item.arrivalschedule.flightId} ({item.arrivalschedule.airportId})</span>
                    </div>
                )}
                {item.departureschedule && (
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-400">Departure Flight</span>
                        <span className="font-medium">{item.departureschedule.flightId} ({item.departureschedule.airportId})</span>
                    </div>
                )}
            </div>

            <button className="w-full bg-white text-black font-bold py-4 rounded-xl text-lg hover:bg-gray-200 transition-colors flex items-center justify-center gap-2">
                Proceed to Payment
                <span className="material-symbols-rounded">arrow_forward</span>
            </button>
        </div>
    );
};

// --- Main Chat Interface ---

export const ChatInterface: React.FC = () => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    {
      id: 'init',
      role: 'assistant',
      content: "Welcome to OBI Concierge. I can arrange your **Arrival**, **Departure**, or **Bundle** VIP services.",
      timestamp: new Date()
    }
  ]);
  const [input, setInput] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [history, setHistory] = useState<any[]>([]); 
  const [activeChips, setActiveChips] = useState<{label: string, prompt: string}[]>(SUGGESTIONS_START);
  
  // Connect to store to assist with flight data management if needed
  const { setFlightResults, currentSearchDirection } = useStore(state => state.bookingContext);
  const dispatchSetFlightResults = useStore(state => state.setFlightResults);

  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages, isLoading, activeChips]);

  const handleSend = async (text: string = input) => {
    if (!text.trim() || isLoading) return;

    const userMsg: ChatMessage = {
      id: Date.now().toString(),
      role: 'user',
      content: text,
      timestamp: new Date()
    };

    setMessages(prev => [...prev, userMsg]);
    setInput('');
    setActiveChips([]); // Hide chips while thinking
    setIsLoading(true);

    try {
      const response = await agent.chat(history, userMsg.content);
      
      const botMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: response.text,
        timestamp: new Date(),
        uiPayload: response.uiPayload 
      };

      setMessages(prev => [...prev, botMsg]);
      setHistory(response.history);

      if (response.uiPayload?.type === 'flights') {
          const schedules = response.uiPayload.data.flightschedule as FlightSchedule[];
          const direction = response.uiPayload.direction; // 'A' or 'D'
          dispatchSetFlightResults(schedules, direction);
          setActiveChips([]); 
      } else if (response.contextTag) {
          switch(response.contextTag) {
              case '[UI:PRODUCT_SELECT]': setActiveChips(SUGGESTIONS_START); break;
              case '[UI:AIRPORT_SELECT]': setActiveChips(SUGGESTIONS_AIRPORT); break;
              case '[UI:PAX_SELECT]': setActiveChips(SUGGESTIONS_PAX); break;
              case '[UI:CONFIRM]': setActiveChips(SUGGESTIONS_CONFIRM); break;
              default: setActiveChips([]);
          }
      } else {
          setActiveChips([]);
      }

    } catch (error: any) {
      console.error("Agent Error:", error);
      
      let errorMessage = "Connection interrupted. Please try again.";
      const errStr = typeof error === 'object' ? JSON.stringify(error) : String(error);
      
      if (errStr.includes('429') || errStr.toLowerCase().includes('quota') || errStr.includes('RESOURCE_EXHAUSTED')) {
        errorMessage = "We are currently experiencing high traffic volume. Please wait a moment and try again.";
      }

      const errorMsg: ChatMessage = {
        id: (Date.now() + 1).toString(),
        role: 'system',
        content: errorMessage,
        timestamp: new Date(),
        isError: true
      };
      setMessages(prev => [...prev, errorMsg]);
    } finally {
      setIsLoading(false);
    }
  };

  const renderUiPayload = (payload: any) => {
    if (!payload) return null;

    if (payload.type === 'flights') {
      const flights = payload.data.flightschedule as FlightSchedule[];
      const direction = payload.direction; // 'A' or 'D'
      
      return (
        <div className="mt-6 w-full grid grid-cols-1 md:grid-cols-2 gap-3">
          {flights.map(f => (
            <FlightCard 
                key={f.scheduleId} 
                flight={f} 
                direction={direction}
                // When clicked, send a message that explicitly mentions the ID so the Agent picks it up
                onSelect={(id) => handleSend(`Select ${direction === 'A' ? 'Arrival' : 'Departure'} Flight Schedule ID: ${id}`)} 
            />
          ))}
        </div>
      );
    }

    if (payload.type === 'summary') {
        return (
            <div className="fixed bottom-0 left-0 right-0 z-50">
                <motion.div
                    initial={{ y: 100 }}
                    animate={{ y: 0 }}
                    transition={{ type: "spring", damping: 20 }}
                >
                    <SummaryCard data={payload.data} />
                </motion.div>
            </div>
        );
    }
    
    return null;
  };

  return (
    <div className="flex flex-col h-screen w-full bg-white text-black font-sans overflow-hidden">
      
      {/* Header */}
      <div className="h-16 border-b border-gray-100 flex items-center justify-between px-6 bg-white/90 backdrop-blur z-20">
        <div className="flex items-center gap-3">
            <div className="w-8 h-8 bg-black rounded-full flex items-center justify-center text-white font-bold text-xs">O</div>
            <span className="font-bold tracking-tight text-lg">OBI Concierge</span>
        </div>
        <button onClick={() => window.location.reload()} className="p-2 hover:bg-gray-100 rounded-full transition-colors">
            <span className="material-symbols-rounded">restart_alt</span>
        </button>
      </div>

      {/* Chat Area */}
      <div className="flex-1 overflow-y-auto p-4 md:p-8 scrollbar-hide">
        <div className="max-w-3xl mx-auto space-y-8 pb-32">
            <AnimatePresence initial={false}>
            {messages.map((msg) => (
                <motion.div
                key={msg.id}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`flex flex-col ${msg.role === 'user' ? 'items-end' : 'items-start'}`}
                >
                    <div
                        className={`max-w-[90%] md:max-w-[75%] px-6 py-4 text-sm md:text-base leading-relaxed ${
                        msg.role === 'user'
                            ? 'bg-black text-white rounded-2xl rounded-tr-sm shadow-md'
                            : msg.isError 
                            ? 'bg-red-50 text-red-600 rounded-2xl rounded-tl-sm border border-red-100'
                            : 'bg-gray-100 text-black rounded-2xl rounded-tl-sm'
                        }`}
                    >
                        {msg.role === 'assistant' ? (
                            <div className="prose prose-sm max-w-none">
                                <ReactMarkdown>{msg.content}</ReactMarkdown>
                            </div>
                        ) : (
                            <p>{msg.content}</p>
                        )}
                    </div>

                    {msg.uiPayload && (
                        <div className="w-full mt-4">
                            {renderUiPayload(msg.uiPayload)}
                        </div>
                    )}
                </motion.div>
            ))}
            </AnimatePresence>

            {isLoading && (
                <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="flex items-center gap-2">
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-75"></div>
                    <div className="w-2 h-2 bg-gray-300 rounded-full animate-bounce delay-150"></div>
                </motion.div>
            )}
            <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Footer Area (Chips + Input) */}
      <div className="bg-white border-t border-gray-100 p-4 pb-6 z-30">
        <div className="max-w-3xl mx-auto">
            {/* Quick Actions / Chips */}
            <AnimatePresence>
                {!isLoading && activeChips.length > 0 && (
                    <div className="mb-4">
                        <QuickReplyChips 
                            options={activeChips} 
                            onSelect={handleSend} 
                        />
                    </div>
                )}
            </AnimatePresence>

            {/* Input Bar */}
            <div className="relative flex items-center gap-3">
                <input
                    type="text"
                    value={input}
                    onChange={(e) => setInput(e.target.value)}
                    onKeyDown={(e) => e.key === 'Enter' && handleSend()}
                    placeholder="Type a request..."
                    className="flex-1 bg-gray-50 text-black rounded-full px-6 py-4 focus:outline-none focus:ring-2 focus:ring-black border border-transparent focus:border-transparent transition-all font-medium placeholder:text-gray-400"
                    disabled={isLoading}
                />
                <button
                    onClick={() => handleSend()}
                    disabled={!input.trim() || isLoading}
                    className="w-14 h-14 bg-black text-white rounded-full flex items-center justify-center hover:scale-105 active:scale-95 transition-transform disabled:opacity-50 disabled:hover:scale-100 shadow-lg"
                >
                    <span className="material-symbols-rounded">arrow_upward</span>
                </button>
            </div>
        </div>
      </div>
    </div>
  );
};