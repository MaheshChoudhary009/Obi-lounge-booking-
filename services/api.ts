import { LoginResponse, ScheduleResponse, ReserveCartResponse, MarketResponse, CartItemsResponse } from '../types';

const BASE_URL = "https://nigeriauat.reliablesoftjm.com/VIPERWS";

const getHeaders = () => ({
  'Content-Type': 'application/json',
  'Accept': 'application/json'
});

export const apiLogin = async (): Promise<LoginResponse> => {
  const response = await fetch(`${BASE_URL}/login`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      failstatus: 0,
      request: {
        username: "esite3@viponline",
        password: "5f4dcc3b5aa765d61d8327deb882cf99",
        marketid: "JAM",
        languageid: "en",
        getpaymentgateway: "Y"
      }
    })
  });
  return response.json();
};

export const apiGetMarkets = async (sessionid: string): Promise<MarketResponse> => {
  const response = await fetch(`${BASE_URL}/getmarkets`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      username: "esite3@viponline",
      sessionid: sessionid,
      failstatus: 0,
      request: {}
    })
  });
  return response.json();
};

export const apiGetSchedule = async (
  sessionid: string,
  direction: 'A' | 'D',
  airportid: string,
  traveldate: string
): Promise<ScheduleResponse> => {
  // Sanitize date: remove hyphens if present to ensure YYYYMMDD
  const sanitizedDate = traveldate.replace(/[^0-9]/g, '');
  
  const response = await fetch(`${BASE_URL}/getschedule`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      username: "esite3@viponline",
      sessionid: sessionid,
      failstatus: 0,
      request: { direction, airportid, traveldate: sanitizedDate }
    })
  });
  return response.json();
};

export const apiReserveCartItem = async (
  sessionid: string,
  payload: any
): Promise<ReserveCartResponse> => {
  const response = await fetch(`${BASE_URL}/reservecartitem`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      username: "esite3@viponline",
      sessionid: sessionid,
      failstatus: 0,
      request: {
        cartitemid: 0,
        paymenttype: "GUESTCARD",
        distributorid: "",
        ...payload
      }
    })
  });
  return response.json();
};

export const apiSetContact = async (
  sessionid: string,
  cartitemid: number,
  contact: any
): Promise<any> => {
  const response = await fetch(`${BASE_URL}/setcontact`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      username: "esite3@viponline",
      sessionid: sessionid,
      failstatus: 0,
      request: {
        contact: { cartitemid, ...contact }
      }
    })
  });
  return response.json();
};

export const apiGetCartItems = async (sessionid: string): Promise<CartItemsResponse> => {
  const response = await fetch(`${BASE_URL}/getcartitems`, {
    method: 'POST',
    headers: getHeaders(),
    body: JSON.stringify({
      username: "esite3@viponline",
      sessionid: sessionid,
      failstatus: 0,
      request: {}
    })
  });
  return response.json();
};