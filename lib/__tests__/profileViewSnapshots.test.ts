import Module from 'node:module';
import { createRequire } from 'node:module';
import assert from 'node:assert/strict';
import { describe, it, before, after } from 'node:test';
import { JSDOM } from 'jsdom';
import React, { createElement } from 'react';
import { render, cleanup } from '@testing-library/react';

import { summarizeCatchMetrics } from '@/lib/catchStats';

const require = createRequire(import.meta.url);
const originalLoad = (Module as any)._load as (...args: any[]) => any;

(Module as any)._load = function patchedLoad(request: string, parent: any, isMain: boolean) {
  if (request === 'next/image') {
    const ReactModule = require('react');
    return ReactModule.forwardRef(function ImageMock(props: any, ref: any) {
      const { alt = '', ...rest } = props ?? {};
      return ReactModule.createElement('img', { ref, alt, ...rest });
    });
  }
  if (request === 'next/link') {
    const ReactModule = require('react');
    return function LinkMock({ href, children, ...rest }: any) {
      return ReactModule.createElement('a', { href, ...rest }, children);
    };
  }
  return originalLoad.call(this, request, parent, isMain);
};

const ProfileView = require('../../components/ProfileView').default as typeof import('../../components/ProfileView').default;

describe('ProfileView angler stats', () => {
  let dom: JSDOM;

  before(() => {
    dom = new JSDOM('<!doctype html><html><body></body></html>', { url: 'http://localhost' });
    const { window } = dom;
    (globalThis as any).window = window;
    (globalThis as any).document = window.document;
    (globalThis as any).navigator = window.navigator;
    (globalThis as any).HTMLElement = window.HTMLElement;
    (globalThis as any).SVGElement = window.SVGElement;
    (globalThis as any).self = window;
    (globalThis as any).React = React;
    (globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;
    (globalThis as any).ResizeObserver = class {
      observe() {}
      unobserve() {}
      disconnect() {}
    };
  });

  after(() => {
    cleanup();
    dom?.window.close();
    (Module as any)._load = originalLoad;
  });

  it('renders extended angler metrics with recent activity', () => {
    const catches = [
      { id: '1', species: 'Bass', weight: '5 lb', trophy: true, caughtAt: '2024-02-28T12:00:00Z' },
      { id: '2', species: 'Bass', weight: '4 lb', trophy: false, caughtAt: '2024-02-15T12:00:00Z' },
      { id: '3', species: 'Trout', weight: '3 lb', trophy: false, caughtAt: '2023-12-20T12:00:00Z' },
    ];

    const summary = summarizeCatchMetrics(catches);

    const { getByText } = render(
      createElement(ProfileView, {
        profile: { displayName: 'Test Angler', username: 'angler', followers: [], following: [] },
        catches,
        catchSummary: summary,
        tackleStats: null,
        teams: [],
      }),
    );

    assert.ok(getByText('Trophy Rate'));
    assert.ok(getByText('Avg Catch Weight'));
    assert.ok(getByText('Top Species'));
    assert.ok(getByText('Recent Activity'));
    assert.ok(getByText('Last 7 days'));
  });
});
