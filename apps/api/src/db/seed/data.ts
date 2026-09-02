/** Reference data for seeding. Realistic Indian names and travel patterns. */

export const FIRST_NAMES = [
  'Aarav', 'Ananya', 'Rohan', 'Priya', 'Vikram', 'Meera', 'Karthik', 'Divya',
  'Arjun', 'Sneha', 'Rahul', 'Kavya', 'Siddharth', 'Nandini', 'Aditya', 'Pooja',
  'Manish', 'Shreya', 'Nikhil', 'Anjali', 'Rajesh', 'Lakshmi', 'Sanjay', 'Ritu',
  'Harish', 'Deepa', 'Praveen', 'Swathi', 'Girish', 'Bhavana', 'Naveen', 'Reshma',
  'Vinod', 'Sunita', 'Ashwin', 'Gayathri', 'Mohan', 'Padma', 'Suresh', 'Vidya',
];

export const LAST_NAMES = [
  'Sharma', 'Iyer', 'Reddy', 'Nair', 'Menon', 'Patel', 'Rao', 'Kulkarni',
  'Krishnan', 'Pillai', 'Desai', 'Bhat', 'Gupta', 'Chandran', 'Naidu', 'Joshi',
  'Verma', 'Subramanian', 'Shetty', 'Malhotra', 'Agarwal', 'Ramesh', 'Prasad', 'Nambiar',
];

export const INTERNATIONAL_DESTINATIONS = [
  'Bali', 'Dubai', 'Singapore', 'Thailand', 'Maldives', 'Switzerland', 'Paris',
  'London', 'Vietnam', 'Sri Lanka', 'Malaysia', 'Turkey', 'Georgia', 'Baku',
  'Mauritius', 'Japan', 'Australia', 'Kenya', 'Egypt', 'Spain',
];

export const DOMESTIC_DESTINATIONS = [
  'Kerala', 'Goa', 'Ladakh', 'Kashmir', 'Andaman', 'Rajasthan', 'Himachal',
  'Sikkim', 'Meghalaya', 'Coorg', 'Ooty', 'Rishikesh', 'Varanasi', 'Hampi',
];

export const LEAD_SOURCES = [
  { key: 'WHATSAPP', name: 'WhatsApp', colour: '#25D366', icon: 'message-circle', scoreWeight: 80, sortOrder: 1 },
  { key: 'WEBSITE', name: 'Website', colour: '#0D8286', icon: 'globe', scoreWeight: 70, sortOrder: 2 },
  { key: 'WALK_IN', name: 'Walk-in', colour: '#F97316', icon: 'door-open', scoreWeight: 95, sortOrder: 3 },
  { key: 'REFERRAL', name: 'Referral', colour: '#8B5CF6', icon: 'users', scoreWeight: 90, sortOrder: 4 },
  { key: 'INSTAGRAM', name: 'Instagram', colour: '#E1306C', icon: 'instagram', scoreWeight: 55, sortOrder: 5 },
  { key: 'EMAIL', name: 'Email', colour: '#3B82F6', icon: 'mail', scoreWeight: 60, sortOrder: 6 },
  { key: 'PHONE', name: 'Phone', colour: '#10B981', icon: 'phone', scoreWeight: 85, sortOrder: 7 },
  { key: 'OTHER', name: 'Other', colour: '#6B797C', icon: 'circle', scoreWeight: 40, sortOrder: 8 },
];

export const TRAVEL_TYPES = [
  { key: 'HONEYMOON', name: 'Honeymoon', sortOrder: 1 },
  { key: 'FAMILY', name: 'Family Holiday', sortOrder: 2 },
  { key: 'GROUP', name: 'Group Tour', sortOrder: 3 },
  { key: 'CORPORATE', name: 'Corporate / MICE', sortOrder: 4 },
  { key: 'SOLO', name: 'Solo Travel', sortOrder: 5 },
  { key: 'PILGRIMAGE', name: 'Pilgrimage', sortOrder: 6 },
  { key: 'ADVENTURE', name: 'Adventure', sortOrder: 7 },
  { key: 'CRUISE', name: 'Cruise', sortOrder: 8 },
];

/** Phase 1 visa scope: 26 countries (spec §19). */
export const VISA_COUNTRIES = [
  { code: 'AE', name: 'United Arab Emirates', min: 3, max: 5 },
  { code: 'SG', name: 'Singapore', min: 3, max: 7 },
  { code: 'TH', name: 'Thailand', min: 5, max: 10 },
  { code: 'MY', name: 'Malaysia', min: 3, max: 7 },
  { code: 'ID', name: 'Indonesia', min: 3, max: 5 },
  { code: 'VN', name: 'Vietnam', min: 5, max: 8 },
  { code: 'LK', name: 'Sri Lanka', min: 1, max: 3 },
  { code: 'MV', name: 'Maldives', min: 1, max: 1 },
  { code: 'NP', name: 'Nepal', min: 1, max: 1 },
  { code: 'BT', name: 'Bhutan', min: 5, max: 10 },
  { code: 'JP', name: 'Japan', min: 5, max: 10 },
  { code: 'KR', name: 'South Korea', min: 7, max: 14 },
  { code: 'CN', name: 'China', min: 7, max: 15 },
  { code: 'HK', name: 'Hong Kong', min: 3, max: 7 },
  { code: 'AU', name: 'Australia', min: 15, max: 30 },
  { code: 'NZ', name: 'New Zealand', min: 15, max: 25 },
  { code: 'GB', name: 'United Kingdom', min: 15, max: 30 },
  { code: 'US', name: 'United States', min: 30, max: 120 },
  { code: 'CA', name: 'Canada', min: 20, max: 45 },
  { code: 'FR', name: 'France (Schengen)', min: 15, max: 25 },
  { code: 'DE', name: 'Germany (Schengen)', min: 15, max: 25 },
  { code: 'CH', name: 'Switzerland (Schengen)', min: 15, max: 25 },
  { code: 'IT', name: 'Italy (Schengen)', min: 15, max: 25 },
  { code: 'ES', name: 'Spain (Schengen)', min: 15, max: 25 },
  { code: 'TR', name: 'Turkey', min: 5, max: 10 },
  { code: 'EG', name: 'Egypt', min: 7, max: 14 },
];

/** Common Schengen / general tourist checklist, applied per country at seed time. */
export const DEFAULT_VISA_CHECKLIST = [
  { label: 'Passport (valid 6+ months, 2 blank pages)', mandatory: true },
  { label: 'Passport-size photographs (white background)', mandatory: true },
  { label: 'Completed visa application form', mandatory: true },
  { label: 'Confirmed return air tickets', mandatory: true },
  { label: 'Hotel booking confirmation', mandatory: true },
  { label: 'Bank statements (last 6 months)', mandatory: true },
  { label: 'Income tax returns (last 2 years)', mandatory: true },
  { label: 'Employment / business proof', mandatory: true },
  { label: 'Travel insurance', mandatory: false },
  { label: 'Covering letter', mandatory: false },
];

export const PAYMENT_METHODS = [
  { key: 'CASH', name: 'Cash', requiresReference: false, sortOrder: 1 },
  { key: 'UPI', name: 'UPI', requiresReference: true, sortOrder: 2 },
  { key: 'NEFT', name: 'NEFT / IMPS', requiresReference: true, sortOrder: 3 },
  { key: 'CARD', name: 'Credit / Debit Card', requiresReference: true, sortOrder: 4 },
  { key: 'CHEQUE', name: 'Cheque', requiresReference: true, sortOrder: 5 },
];

export const SUPPLIER_TYPES = [
  { key: 'HOTEL', name: 'Hotel' },
  { key: 'DMC', name: 'Destination Management Company' },
  { key: 'AIRLINE', name: 'Airline / Consolidator' },
  { key: 'TRANSPORT', name: 'Transport' },
  { key: 'ACTIVITY', name: 'Activity Provider' },
  { key: 'INSURANCE', name: 'Insurance' },
  { key: 'VISA_AGENT', name: 'Visa Agent' },
];

export const TEAM = [
  { fullName: 'Anitha Krishnan', email: 'anitha@lemuriaholidays.test', role: 'ADMIN', designation: 'Director' },
  { fullName: 'Ramesh Subramanian', email: 'ramesh@lemuriaholidays.test', role: 'MANAGER', designation: 'Sales Manager' },
  { fullName: 'Divya Menon', email: 'divya@lemuriaholidays.test', role: 'EXECUTIVE', designation: 'Senior Travel Consultant' },
  { fullName: 'Karthik Nair', email: 'karthik@lemuriaholidays.test', role: 'EXECUTIVE', designation: 'Travel Consultant' },
  { fullName: 'Sneha Pillai', email: 'sneha@lemuriaholidays.test', role: 'EXECUTIVE', designation: 'Travel Consultant' },
  { fullName: 'Vinod Bhat', email: 'vinod@lemuriaholidays.test', role: 'OPERATIONS', designation: 'Visa & Documentation' },
  { fullName: 'Lakshmi Rao', email: 'lakshmi@lemuriaholidays.test', role: 'FINANCE', designation: 'Accounts' },
];

export const FOLLOWUP_NOTES = [
  'Called; asked to share a Bali package with 4-star stays.',
  'Sent quotation on WhatsApp, awaiting confirmation.',
  'Wants to compare two itineraries before deciding.',
  'Requested a cheaper option within budget.',
  'Family finalising leave dates, will confirm next week.',
  'Asked about visa requirements and processing time.',
  'Interested but wants to travel after the school holidays.',
  'Needs an early-morning flight option.',
  'Checking with spouse before booking.',
  'Requested honeymoon inclusions and a candlelight dinner.',
];

export const CUSTOMER_NOTES = [
  'Repeat customer, prefers premium hotels.',
  'Travels with elderly parents; needs accessible rooms.',
  'Vegetarian meals for the whole group.',
  'Prefers window seats on long-haul flights.',
  'Books the same week every year.',
];
