/* eslint-env node */
/* eslint import/no-nodejs-modules:0 */
import {TextDecoder, TextEncoder} from 'util';

import {InjectedRouter} from 'react-router';
import {configure, getConfig} from '@testing-library/react'; // eslint-disable-line no-restricted-imports
import Adapter from '@wojtekmaj/enzyme-adapter-react-17';
import Enzyme from 'enzyme'; // eslint-disable-line no-restricted-imports
import {Location} from 'history';
import MockDate from 'mockdate';
import PropTypes from 'prop-types';
import * as qs from 'query-string';

import type {Client} from 'sentry/__mocks__/api';
import ConfigStore from 'sentry/stores/configStore';

import TestStubFixtures from '../fixtures/js-stubs/types';

import {loadFixtures} from './sentry-test/loadFixtures';

// needed by cbor-web for webauthn
window.TextEncoder = TextEncoder;
window.TextDecoder = TextDecoder as typeof window.TextDecoder;

/**
 * XXX(epurkhiser): Gross hack to fix a bug in jsdom which makes testing of
 * framer-motion SVG components fail
 *
 * See https://github.com/jsdom/jsdom/issues/1330
 */
// @ts-expect-error
SVGElement.prototype.getTotalLength ??= () => 1;

/**
 * React Testing Library configuration to override the default test id attribute
 *
 * See: https://testing-library.com/docs/queries/bytestid/#overriding-data-testid
 */
const currentRTLConfig = getConfig();
configure({
  testIdAttribute: 'data-test-id',
  eventWrapper: (...args) => {
    // This function will wrap any events that are created such as click.
    const start = performance.now();
    const result = currentRTLConfig.eventWrapper(...args);
    const end = performance.now();
    if (end - start > 16 && global.transaction && global.transaction.startChild) {
      // > 16ms, 60fps frame.
      global.transaction.startChild({
        op: 'event',
        desc: 'eventWrapper',
        startTimestamp: start / 1000,
        endTimestamp: end / 1000,
      });
    }

    return result;
  },
});

// Putting all this specific code in it's own function.
function testIsolationChecks() {
  const _resolveFns: any[] = [];

  (global as any)._registerAutoResolve = resolveFn => _resolveFns.push(resolveFn);
  const _inflightTestPromises: any[] = [];
  const OriginalPromise: any = global.Promise;

  let promiseCounter = 1;

  function resolveRejectWrapper(fn, __promiseId) {
    return (...args) => {
      if (__promiseId) {
        const promise = _inflightTestPromises.find(p => p.__promiseId === __promiseId);
        const index = _inflightTestPromises.indexOf(promise);
        if (index > -1) {
          _inflightTestPromises.splice(index, 1);
        }
      }
      return fn(...args);
    };
  }

  function _fnWrapper(fn, __promiseId) {
    return (resolve, reject) => {
      const _wrappedResolve = resolveRejectWrapper(resolve, __promiseId);
      const _wrappedReject = resolveRejectWrapper(reject, __promiseId);
      return fn(_wrappedResolve, _wrappedReject);
      // return fn(resolve, reject);
    };
  }

  (global.Promise as any) = class Promise extends OriginalPromise {
    constructor(fn) {
      const __promiseId = promiseCounter;
      const wrapped = _fnWrapper(fn, __promiseId);
      super(wrapped);

      _inflightTestPromises.push(this);
      this.__promiseId = __promiseId;
      promiseCounter++;

      this.__promiseCreationStack = new Error().stack;
    }
  };

  beforeEach(() => {
    _resolveFns.splice(0, _resolveFns.length); // Free resolve fns
    _inflightTestPromises.splice(0, _inflightTestPromises.length); // Free promise refs
  });

  afterEach(() => {
    _resolveFns.forEach(resolve =>
      resolve('If you are seeing this then you are outside the bounds of a test')
    );

    const remainingInflight = _inflightTestPromises.length;
    if (remainingInflight) {
      // eslint-disable-next-line no-console
      console.log(
        _inflightTestPromises.map(p => p.__promiseCreationStack).join('\n\n\n')
      );
      throw new Error(
        `(${remainingInflight}) Promises detected outside the bounds of the test: ${
          expect.getState().currentTestName
        }`
      );
    }
  });
}

testIsolationChecks();

/**
 * Enzyme configuration
 *
 * TODO(epurkhiser): We're using @wojtekmaj's react-17 enzyme adapter, until
 * the offical adapter has been released.
 *
 * https://github.com/enzymejs/enzyme/issues/2429
 */
Enzyme.configure({adapter: new Adapter()});

/**
 * Mock (current) date to always be National Pasta Day
 * 2017-10-17T02:41:20.000Z
 */
const constantDate = new Date(1508208080000);
MockDate.set(constantDate);

/**
 * Load all files in `tests/js/fixtures/*` as a module.
 * These will then be added to the `TestStubs` global below
 */
const fixtures = loadFixtures('js-stubs', {flatten: true});

/**
 * Global testing configuration
 */
ConfigStore.loadInitialData(fixtures.Config());

/**
 * Mocks
 */
jest.mock('lodash/debounce', () => jest.fn(fn => fn));
jest.mock('sentry/utils/recreateRoute');
jest.mock('sentry/api');
jest.mock('sentry/utils/withOrganization');
jest.mock('scroll-to-element', () => jest.fn());
jest.mock('react-router', () => {
  const ReactRouter = jest.requireActual('react-router');
  return {
    ...ReactRouter,
    browserHistory: {
      goBack: jest.fn(),
      push: jest.fn(),
      replace: jest.fn(),
      listen: jest.fn(() => {}),
    },
  };
});
jest.mock('react-lazyload', () => {
  const LazyLoadMock = ({children}) => children;
  return LazyLoadMock;
});

jest.mock('react-virtualized', () => {
  const ActualReactVirtualized = jest.requireActual('react-virtualized');
  return {
    ...ActualReactVirtualized,
    AutoSizer: ({children}) => children({width: 100, height: 100}),
  };
});

jest.mock('echarts-for-react/lib/core', () => {
  // We need to do this because `jest.mock` gets hoisted by babel and `React` is not
  // guaranteed to be in scope
  const ReactActual = require('react');

  // We need a class component here because `BaseChart` passes `ref` which will
  // error if we return a stateless/functional component
  return class extends ReactActual.Component {
    render() {
      return null;
    }
  };
});

jest.mock('@sentry/react', () => {
  const SentryReact = jest.requireActual('@sentry/react');
  return {
    init: jest.fn(),
    configureScope: jest.fn(),
    setTag: jest.fn(),
    setTags: jest.fn(),
    setExtra: jest.fn(),
    setExtras: jest.fn(),
    captureBreadcrumb: jest.fn(),
    addBreadcrumb: jest.fn(),
    captureMessage: jest.fn(),
    captureException: jest.fn(),
    showReportDialog: jest.fn(),
    startSpan: jest.fn(),
    finishSpan: jest.fn(),
    lastEventId: jest.fn(),
    getCurrentHub: jest.spyOn(SentryReact, 'getCurrentHub'),
    withScope: jest.spyOn(SentryReact, 'withScope'),
    Severity: SentryReact.Severity,
    withProfiler: SentryReact.withProfiler,
    startTransaction: () => ({
      finish: jest.fn(),
      setTag: jest.fn(),
      setData: jest.fn(),
      setStatus: jest.fn(),
    }),
  };
});

jest.mock('popper.js', () => {
  const PopperJS = jest.requireActual('popper.js');

  return class {
    static placements = PopperJS.placements;

    constructor() {
      return {
        destroy: () => {},
        scheduleUpdate: () => {},
      };
    }
  };
});

const routerFixtures = {
  router: (params = {}): InjectedRouter => ({
    push: jest.fn(),
    replace: jest.fn(),
    go: jest.fn(),
    goBack: jest.fn(),
    goForward: jest.fn(),
    setRouteLeaveHook: jest.fn(),
    isActive: jest.fn(),
    createHref: jest.fn().mockImplementation(to => {
      if (typeof to === 'string') {
        return to;
      }

      if (typeof to === 'object') {
        if (!to.query) {
          return to.pathname;
        }

        return `${to.pathname}?${qs.stringify(to.query)}`;
      }

      return '';
    }),
    location: TestStubs.location(),
    createPath: jest.fn(),
    routes: [],
    params: {},
    ...params,
  }),

  location: (params: Partial<Location> = {}): Location => ({
    key: '',
    search: '',
    hash: '',
    action: 'PUSH',
    state: null,
    query: {},
    pathname: '/mock-pathname/',
    ...params,
  }),

  routerProps: (params = {}) => ({
    location: TestStubs.location(),
    params: {},
    routes: [],
    stepBack: () => {},
    ...params,
  }),

  routerContext: ([context, childContextTypes] = []) => ({
    context: {
      location: TestStubs.location(),
      router: TestStubs.router(),
      organization: fixtures.Organization(),
      project: fixtures.Project(),
      ...context,
    },
    childContextTypes: {
      router: PropTypes.object,
      location: PropTypes.object,
      organization: PropTypes.object,
      project: PropTypes.object,
      ...childContextTypes,
    },
  }),
};

type TestStubTypes = TestStubFixtures & typeof routerFixtures;

/**
 * Test Globals
 */
declare global {
  /**
   * Test stubs are automatically loaded from the fixtures/js-stubs
   * directory. Use these for setting up test data.
   */
  // eslint-disable-next-line no-var
  var TestStubs: TestStubTypes;
  /**
   * Generates a promise that resolves on the next macro-task
   */
  // eslint-disable-next-line no-var
  var tick: () => Promise<void>;
  /**
   * Used to mock API requests
   */
  // eslint-disable-next-line no-var
  var MockApiClient: typeof Client;
}

window.TestStubs = {...fixtures, ...routerFixtures};

// This is so we can use async/await in tests instead of wrapping with `setTimeout`.
window.tick = () => new Promise(resolve => setTimeout(resolve));

window.MockApiClient = jest.requireMock('sentry/api').Client;

window.scrollTo = jest.fn();

// We need to re-define `window.location`, otherwise we can't spyOn certain
// methods as `window.location` is read-only
Object.defineProperty(window, 'location', {
  value: {...window.location, assign: jest.fn(), reload: jest.fn()},
  configurable: true,
  writable: true,
});
