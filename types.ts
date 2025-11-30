export enum ProductType {
  ARRIVAL_ONLY = 'ARRIVALONLY',
  DEPARTURE_ONLY = 'DEPARTUREONLY',
  ARRIVAL_BUNDLE = 'ARRIVALBUNDLE'
}

export interface FlightSchedule {
  scheduleId: number;
  targetDate: string;
  airportId: string;
  airline: string;
  flightId: string;
  flightNumber: string;
}

export interface MarketResponse {
  status: number;
  data: {
    airports: {
      airportid: string;
      lounge: string;
      arrivalmaxseats: number;
    }[];
    pricelist: {
      airportid: string;
      productid: string;
      adultrate: number;
      childrate: number;
    }[];
  };
}

export interface LoginResponse {
  status: number;
  data: {
    username: string;
    sessionid: string;
    distributorprofile: {
      currencycode: string;
      infantallowed: string;
      maxseatsSIA: number;
      maxseatsNMIA: number;
    };
  };
}

export interface ScheduleResponse {
  status: number;
  data: {
    flightschedule: FlightSchedule[];
    airlines: { airlineid: string; description: string }[];
    flights: { airlineid: string; flightid: string; flighttime: string; flightnumber: string }[];
  };
}

export interface ReserveCartResponse {
  status: number;
  statusMessage: string;
  data?: {
    cartitemid: number;
    productid: string;
    ticketsrequested: number;
    ticketsconfirmed: number;
    wholesale: number;
    retail: number;
  };
}

export interface CartItemsResponse {
  status: number;
  data: {
    cartitemids: {
      cartitemid: number;
      productid: string;
      adulttickets: number;
      childtickets: number;
      retail: number;
      arrivalschedule?: any;
      departureschedule?: any;
    }[];
  };
}

export interface ChatMessage {
  id: string;
  role: 'user' | 'assistant' | 'system';
  content: string;
  timestamp: Date;
  isError?: boolean;
  uiPayload?: any; 
}

// New Interface for Smart Context - The "Brain" of the agent
export interface PendingContext {
  flightIdentifier?: string; // e.g. "AA123" or "BW32" - captured early
  travelDate?: string;      // e.g. "20251101" - captured early
  productIntent?: ProductType;
  partialContact?: {
    firstName?: string;
    lastName?: string;
    email?: string;
    phone?: string;
    title?: string;
  };
}