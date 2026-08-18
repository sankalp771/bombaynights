import { describe, expect, it } from 'vitest';
import { closesAfterMidnight, corridorOutletUrls, parseOutletPage } from './chains';

// Trimmed from a real mcdelivery.co.in outlet page (Lower Parel Kamala Mills).
const OUTLET_HTML = `
  <html><body>
    <h1 class="title">  McDonald's Mumbai <span>Lower Parel</span> Kamala Mills </h1>
    <div itemprop="OpeningHoursSpecification" itemscope itemtype="https://schema.org/openingHoursSpecification">
      <meta itemprop="opens" content="09:00:00">
      <meta itemprop="closes" content="01:55:00">
    </div>
    <div class="header-banner-container__title"> Store Timings </div>
    <meta itemprop="latitude" content="19.00270347">
    <meta itemprop="longitude" content="72.82848451">
  </body></html>`;

describe('parseOutletPage', () => {
  it('extracts name, timings and coordinates from microdata', () => {
    expect(parseOutletPage(OUTLET_HTML)).toEqual({
      name: "McDonald's Mumbai Lower Parel Kamala Mills",
      opens: '09:00',
      closes: '01:55',
      lat: 19.00270347,
      lng: 72.82848451,
    });
  });

  it('returns null rather than guessing when a fact is missing', () => {
    expect(parseOutletPage(OUTLET_HTML.replace('itemprop="closes"', 'itemprop="nope"'))).toBeNull();
    expect(parseOutletPage('<h1>Just a name</h1>')).toBeNull();
    expect(parseOutletPage(OUTLET_HTML.replace('19.00270347', 'not-a-number'))).toBeNull();
  });
});

describe('closesAfterMidnight', () => {
  it('detects overnight closes', () => {
    expect(closesAfterMidnight('09:00', '01:55')).toBe(true);
    expect(closesAfterMidnight('05:00', '02:55')).toBe(true);
  });

  it('rejects same-day closes and midnight sharp', () => {
    expect(closesAfterMidnight('09:00', '23:55')).toBe(false);
    expect(closesAfterMidnight('09:00', '00:00')).toBe(false); // till midnight ≠ late-night
  });
});

describe('corridorOutletUrls', () => {
  it('keeps Mumbai and corridor-Thane outlets, drops the rest', () => {
    const xml = `
      <urlset>
        <url><loc>https://x.in/restaurants/mumbai/10/order-food-online-in-mcdonalds-colaba</loc></url>
        <url><loc>https://x.in/restaurants/thane/132/order-food-online-in-mcdonalds-landmark-bhayander-west</loc></url>
        <url><loc>https://x.in/restaurants/thane/99/order-food-online-in-mcdonalds-viviana-mall</loc></url>
        <url><loc>https://x.in/restaurants/pune/1/order-food-online-in-mcdonalds-fc-road</loc></url>
        <url><loc>https://x.in/menu/659-burgers-wraps</loc></url>
      </urlset>`;
    expect(corridorOutletUrls(xml)).toEqual([
      'https://x.in/restaurants/mumbai/10/order-food-online-in-mcdonalds-colaba',
      'https://x.in/restaurants/thane/132/order-food-online-in-mcdonalds-landmark-bhayander-west',
    ]);
  });
});
