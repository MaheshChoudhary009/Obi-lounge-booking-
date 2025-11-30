import { GoogleGenAI, FunctionDeclaration, Type } from "@google/genai";
import { apiLogin, apiGetMarkets, apiGetSchedule, apiReserveCartItem, apiSetContact, apiGetCartItems } from "./api";
import { useStore } from "../store";
import { ProductType } from "../types";

// --- Tool Definitions ---

const tools: FunctionDeclaration[] = [
  {
    name: "initialize_session",
    description: "Authenticates the user and gets a session ID. Call this first if no session exists.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "update_booking_context",
    description: "CRITICAL: Call this IMMEDIATELY when the user provides ANY information (Name, Date, Flight Number, Phone, Pax Counts), even if out of order. This saves the data to the Agent's Memory.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        flight_number: { type: Type.STRING, description: "e.g. AA123, BW32" },
        travel_date_yyyymmdd: { type: Type.STRING, description: "YYYYMMDD format" },
        first_name: { type: Type.STRING },
        last_name: { type: Type.STRING },
        email: { type: Type.STRING },
        phone: { type: Type.STRING },
        adults: { type: Type.INTEGER },
        children: { type: Type.INTEGER },
        infants: { type: Type.INTEGER },
        product_intent: { type: Type.STRING, enum: ["ARRIVALONLY", "DEPARTUREONLY", "ARRIVALBUNDLE"] },
        airport_code: { type: Type.STRING, enum: ["SIA", "NMIA"] }
      }
    }
  },
  {
    name: "get_flight_schedule",
    description: "Fetches flight list for a specific date and direction. The Agent will check its Memory for a matching flight_number to auto-select.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        direction: { type: Type.STRING, enum: ["A", "D"], description: "A for Arrival, D for Departure" },
        date_yyyymmdd: { type: Type.STRING, description: "Format strictly YYYYMMDD. If missing, check context." },
        airport_code: { type: Type.STRING, enum: ["SIA", "NMIA"], description: "If missing, check context." }
      },
      required: ["direction", "date_yyyymmdd"]
    }
  },
  {
    name: "select_flight",
    description: "Selects a specific flight from the previously searched schedule list. Used when auto-selection isn't possible.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        flight_identifier: { type: Type.STRING, description: "The visible Flight Number (e.g. 'AA1400') or Schedule ID." },
        direction: { type: Type.STRING, enum: ["A", "D"] }
      },
      required: ["flight_identifier", "direction"]
    }
  },
  {
    name: "finalize_reservation",
    description: "Calls reservecartitem API. Used ONLY after flights are selected and pax counts are confirmed.",
    parameters: { type: Type.OBJECT, properties: {} }
  },
  {
    name: "save_contact_info",
    description: "Calls setcontact API. If contact details are in Memory, use them. MUST be called after finalize_reservation.",
    parameters: {
      type: Type.OBJECT,
      properties: {}, 
    }
  },
  {
    name: "show_booking_summary",
    description: "Calls getcartitems API to show the final bill.",
    parameters: { type: Type.OBJECT, properties: {} }
  }
];

const SYSTEM_INSTRUCTION = `
You are **OBI**, the **Smartest AI Concierge** for ReliableSoft Lounge Services.
You utilize a **"Memory First"** approach to handle user information provided in ANY order.

**YOUR SUPERPOWER:**
- **Context Awareness:** Users might say "Book for Mahesh 99999" before choosing a flight. You MUST save "Mahesh" and "99999" to your Memory immediately using \`update_booking_context\`.
- **Auto-Fill:** If you have the Flight Number in Memory (e.g., "AA123") when you search for flights, **Auto-Select** it from the results without asking the user "Which flight?".
- **Skip Redundancy:** If you have Contact Info in Memory, do NOT ask "What is your name?" again. Just confirm and call \`save_contact_info\`.

**STRICT MANUAL BOOKING FLOW (Backend Rules):**
1. **Initialize:** Call \`initialize_session\` if new.
2. **Capture Data:** Call \`update_booking_context\` for EVERY piece of info the user gives (Dates, Names, Flights, Intent).
3. **Product & Schedule:**
   - Confirm Product (Arrival/Departure/Bundle).
   - Call \`get_flight_schedule\`. **Smart Check:** If the user gave a Flight Number earlier, the tool will try to auto-select it.
4. **Reserve:** Call \`finalize_reservation\`.
5. **Contact:** Call \`save_contact_info\`. (Check Memory first!).
6. **Summary:** Call \`show_booking_summary\`.

**RULES:**
- **One-Shot Handling:** If the user says "Book Arrival for John on AA123 tomorrow", you must chain the calls: UpdateContext -> Login -> GetSchedule -> Reserve -> Contact -> Summary.
- **Dates:** Convert "Next Friday" to YYYYMMDD.
- **Flight Selection:** Always prefer Auto-Selection based on context.

**UI TAGS:**
- [UI:PRODUCT_SELECT] -> Asking for service type.
- [UI:AIRPORT_SELECT] -> Asking for airport.
`;

export class AgentService {
  private ai: GoogleGenAI;

  constructor() {
    this.ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  }

  private async sendMessageWithRetry(chatSession: any, params: any, retries = 3): Promise<any> {
    for (let i = 0; i < retries; i++) {
      try {
        return await chatSession.sendMessage(params);
      } catch (error: any) {
        if (error?.status === 429 && i < retries - 1) {
          await new Promise(r => setTimeout(r, Math.pow(2, i) * 1500));
          continue;
        }
        throw error;
      }
    }
  }

  async chat(history: any[], message: string): Promise<{ text: string; history: any[]; uiPayload?: any; contextTag?: string }> {
    const chatSession = this.ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        systemInstruction: SYSTEM_INSTRUCTION,
        tools: [{ functionDeclarations: tools }],
      },
      history: history,
    });

    let result = await this.sendMessageWithRetry(chatSession, { message });
    let functionCalls = result.functionCalls;
    let uiPayload = null;

    // Loop to handle chained function calls (e.g. Update -> Login -> Search -> Select)
    while (functionCalls && functionCalls.length > 0) {
      const toolResponses: any[] = [];

      for (const call of functionCalls) {
        console.log(`[Agent Tool] ${call.name}`, call.args);
        let apiResult: any = { status: "error", message: "Unknown error" };
        const args = call.args as any;
        const state = useStore.getState();

        try {
          switch (call.name) {
            case "initialize_session":
              if (state.sessionid) {
                apiResult = { status: "success", message: "Session already active." };
              } else {
                const loginRes = await apiLogin();
                if (loginRes.status === 0) {
                  const marketsRes = await apiGetMarkets(loginRes.data.sessionid);
                  state.setSession(loginRes.data.sessionid);
                  state.setMarketRules(marketsRes.data);
                  apiResult = { status: "success", sessionid: loginRes.data.sessionid };
                } else {
                  apiResult = { status: "error", message: "Login failed." };
                }
              }
              break;

            case "update_booking_context":
              const pendingUpdate: any = {};
              if (args.flight_number) pendingUpdate.flightIdentifier = args.flight_number;
              if (args.travel_date_yyyymmdd) pendingUpdate.travelDate = args.travel_date_yyyymmdd;
              
              const partialContact: any = {};
              if (args.first_name) partialContact.firstName = args.first_name;
              if (args.last_name) partialContact.lastName = args.last_name;
              if (args.email) partialContact.email = args.email;
              if (args.phone) partialContact.phone = args.phone;
              if (Object.keys(partialContact).length > 0) pendingUpdate.partialContact = partialContact;

              state.updatePendingContext(pendingUpdate);
              
              if (args.product_intent) state.setTargetProduct(args.product_intent);
              
              const paxUpdate: any = {};
              if (args.adults) paxUpdate.adults = args.adults;
              if (args.children) paxUpdate.children = args.children;
              if (args.infants) paxUpdate.infants = args.infants;
              if (Object.keys(paxUpdate).length > 0) state.updatePassengerInfo(paxUpdate);

              apiResult = { status: "success", message: "Context updated in Memory." };
              break;

            case "get_flight_schedule":
              // Auto-recover session
              if (!state.sessionid) {
                 const r = await apiLogin();
                 state.setSession(r.data.sessionid);
              }
              
              // Prefer Context if arguments are missing
              const date = args.date_yyyymmdd || state.bookingContext.pendingData.travelDate;
              // Default to SIA if unknown, but normally we'd ask. Using SIA for robustness.
              const airport = args.airport_code || "SIA"; 

              if (!date) {
                apiResult = { status: "error", message: "Date is required." };
                break;
              }

              const schedRes = await apiGetSchedule(state.sessionid!, args.direction, airport, date);
              if (schedRes.status === 0) {
                state.setFlightResults(schedRes.data.flights, args.direction);
                
                // --- SMART AUTO-SELECT LOGIC ---
                // The Agent checks its memory (pendingData) to see if the user already provided a flight code
                const memoryFlight = state.bookingContext.pendingData.flightIdentifier;
                let autoSelected = false;
                let selectedId = "";

                if (memoryFlight) {
                  const target = memoryFlight.replace(/\s+/g, '').toUpperCase();
                  const found = schedRes.data.flights.find((f: any) => 
                    (f.airlineid + f.flightnumber).replace(/\s+/g, '') === target || 
                    f.flightid.replace(/\s+/g, '') === target ||
                    f.flightnumber === target
                  );
                  
                  if (found) {
                    const sid = Number(schedRes.data.flightschedule.find((fs: any) => fs.flightId === found.flightid)?.scheduleId);
                    if (sid) {
                        if (args.direction === 'A') state.selectArrivalFlight(sid);
                        else state.selectDepartureFlight(sid);
                        autoSelected = true;
                        selectedId = found.flightid;
                    }
                  }
                }
                
                if (autoSelected) {
                    apiResult = { status: "success", message: `Flights found. AUTO-SELECTED flight ${selectedId} based on user context.` };
                } else {
                    apiResult = { status: "success", count: schedRes.data.flights.length, message: "Flights found. Please ask user to select." };
                    uiPayload = { type: 'flights', data: schedRes.data, direction: args.direction };
                }
              } else {
                apiResult = { status: "error", message: "No flights found." };
              }
              break;

            case "select_flight":
              const flightList = state.bookingContext.lastFlightSearchResults;
              const identifier = String(args.flight_identifier);
              const dir = args.direction;

              const foundFlight = flightList.find((f: any) => 
                String(f.scheduleId) === identifier ||
                f.flightid === identifier || 
                f.flightnumber === identifier
              );

              if (foundFlight) {
                const id = Number(foundFlight.scheduleId);
                if (dir === 'A') state.selectArrivalFlight(id);
                else state.selectDepartureFlight(id);
                apiResult = { status: "success", message: `Flight ${foundFlight.flightId} selected.` };
              } else {
                 // Fallback for ID direct
                 if (!isNaN(Number(identifier))) {
                   const id = Number(identifier);
                   if (dir === 'A') state.selectArrivalFlight(id);
                   else state.selectDepartureFlight(id);
                   apiResult = { status: "success", message: `Flight ID ${id} set.` };
                 } else {
                   apiResult = { status: "error", message: "Flight not found." };
                 }
              }
              break;

            case "finalize_reservation":
              if (!state.sessionid) throw new Error("No session.");
              const ctx = state.bookingContext;
              const pax = ctx.passengerInfo;
              
              const resPayload = {
                  productid: ctx.targetProduct || "ARRIVALONLY", // Fallback
                  ticketsrequested: (pax.adults || 0) + (pax.children || 0) + (pax.infants || 0),
                  adulttickets: pax.adults,
                  childtickets: pax.children,
                  infanttickets: pax.infants,
                  arrivalscheduleid: ctx.selectedArrivalFlightId || 0,
                  departurescheduleid: ctx.selectedDepartureFlightId || 0
              };

              const resRes = await apiReserveCartItem(state.sessionid, resPayload);

              if (resRes.status === 0) {
                  state.setCartItem(resRes.data!.cartitemid);
                  apiResult = { status: "success", cartitemid: resRes.data!.cartitemid };
              } else {
                  apiResult = { status: "fail", message: resRes.statusMessage };
              }
              break;

            case "save_contact_info":
              if (!state.sessionid || !state.cartItemId) throw new Error("No active reservation.");
              const pInfo = state.bookingContext.passengerInfo;
              
              await apiSetContact(state.sessionid, state.cartItemId, {
                title: pInfo.title || "MR",
                firstname: pInfo.firstName || "Guest",
                lastname: pInfo.lastName || "User",
                email: pInfo.email || "guest@example.com",
                phone: pInfo.phone || "0000000000"
              });
              apiResult = { status: "success", message: "Contact saved." };
              break;

            case "show_booking_summary":
              if (!state.sessionid) throw new Error("No session.");
              const cartRes = await apiGetCartItems(state.sessionid);
              if (cartRes.status === 0) {
                uiPayload = { type: 'summary', data: cartRes.data };
                apiResult = { status: "success" };
              }
              break;
          }
        } catch (e: any) {
          apiResult = { status: "error", message: e.message };
        }

        toolResponses.push({
          functionResponse: { 
            name: call.name, 
            response: apiResult,
            id: call.id 
          }
        });
      }

      result = await this.sendMessageWithRetry(chatSession, { message: toolResponses });
      functionCalls = result.functionCalls;
    }

    let finalContent = result.text || "";
    
    // UI Tag Handling
    const uiTagRegex = /\[\s*UI:[A-Z_]+\s*\]/g;
    const matches = [...finalContent.matchAll(uiTagRegex)];
    const contextTag = matches.length > 0 ? matches[matches.length - 1][0] : undefined;
    finalContent = finalContent.replace(uiTagRegex, "").trim();

    return {
      text: finalContent,
      history: await chatSession.getHistory(),
      uiPayload,
      contextTag
    };
  }
}

export const agent = new AgentService();