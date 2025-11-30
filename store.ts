import { create } from 'zustand';
import { FlightSchedule, ProductType, PendingContext } from './types';

interface PassengerInfo {
  title?: string;
  firstName?: string;
  lastName?: string;
  email?: string;
  phone?: string;
  dob?: string;
  adults?: number;
  children?: number;
  infants?: number;
}

interface AppState {
  sessionid: string | null;
  marketRules: any | null; 
  cartItemId: number | null;
  
  // Context for AI Memory
  bookingContext: {
    targetProduct: ProductType | null; 
    lastFlightSearchResults: FlightSchedule[]; 
    currentSearchDirection: 'A' | 'D' | null; 
    selectedArrivalFlightId: number | null;
    selectedDepartureFlightId: number | null;
    passengerInfo: PassengerInfo;
    
    // The "Redis" of our frontend - stores out-of-order data
    pendingData: PendingContext;
  };

  setSession: (id: string) => void;
  setMarketRules: (rules: any) => void;
  setCartItem: (id: number) => void;
  
  // Context Actions
  setTargetProduct: (product: ProductType) => void;
  setFlightResults: (flights: FlightSchedule[], direction: 'A' | 'D') => void;
  selectArrivalFlight: (id: number) => void;
  selectDepartureFlight: (id: number) => void;
  updatePassengerInfo: (info: Partial<PassengerInfo>) => void;
  
  // Smart Memory Actions
  updatePendingContext: (data: Partial<PendingContext>) => void;
  
  reset: () => void;
}

export const useStore = create<AppState>((set) => ({
  sessionid: null,
  marketRules: null,
  cartItemId: null,
  
  bookingContext: {
    targetProduct: null,
    lastFlightSearchResults: [],
    currentSearchDirection: null,
    selectedArrivalFlightId: null,
    selectedDepartureFlightId: null,
    passengerInfo: { adults: 1, children: 0, infants: 0 },
    pendingData: {}
  },

  setSession: (id) => set({ sessionid: id }),
  setMarketRules: (rules) => set({ marketRules: rules }),
  setCartItem: (id) => set({ cartItemId: id }),

  setTargetProduct: (product) => set((state) => ({
    bookingContext: { ...state.bookingContext, targetProduct: product }
  })),

  setFlightResults: (flights, direction) => set((state) => ({
    bookingContext: { 
      ...state.bookingContext, 
      lastFlightSearchResults: flights,
      currentSearchDirection: direction 
    }
  })),

  selectArrivalFlight: (id) => set((state) => ({
    bookingContext: { ...state.bookingContext, selectedArrivalFlightId: id }
  })),

  selectDepartureFlight: (id) => set((state) => ({
    bookingContext: { ...state.bookingContext, selectedDepartureFlightId: id }
  })),

  updatePassengerInfo: (info) => set((state) => ({
    bookingContext: { 
      ...state.bookingContext, 
      passengerInfo: { ...state.bookingContext.passengerInfo, ...info } 
    }
  })),

  updatePendingContext: (data) => set((state) => {
    // If contact info is provided in the pending update, immediately sync it to passengerInfo
    const updatedPassengerInfo = data.partialContact ? {
      ...state.bookingContext.passengerInfo,
      ...data.partialContact
    } : state.bookingContext.passengerInfo;

    return {
      bookingContext: {
        ...state.bookingContext,
        pendingData: { ...state.bookingContext.pendingData, ...data },
        passengerInfo: updatedPassengerInfo
      }
    };
  }),

  reset: () => set({ 
    sessionid: null, 
    marketRules: null, 
    cartItemId: null,
    bookingContext: {
      targetProduct: null,
      lastFlightSearchResults: [],
      currentSearchDirection: null,
      selectedArrivalFlightId: null,
      selectedDepartureFlightId: null,
      passengerInfo: { adults: 1, children: 0, infants: 0 },
      pendingData: {}
    }
  })
}));