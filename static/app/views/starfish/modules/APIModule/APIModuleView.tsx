import {Fragment} from 'react';
import {useQuery} from '@tanstack/react-query';
import {Location} from 'history';

import GridEditable, {GridColumnHeader} from 'sentry/components/gridEditable';
import {Series} from 'sentry/types/echarts';
import Chart from 'sentry/views/starfish/components/chart';

import {ENDPOINT_GRAPH_QUERY, ENDPOINT_LIST_QUERY} from './queries';

const HOST = 'http://localhost:8080';

type Props = {
  location: Location;
};

type DataRow = {
  count: number;
  description: string;
};

const COLUMN_ORDER = [
  {
    key: 'description',
    name: 'Transaction',
    width: 600,
  },
  {
    key: 'count',
    name: 'Count',
  },
];

export default function APIModuleView({location}: Props) {
  const {isLoading: areEndpointsLoading, data: endpointsData} = useQuery({
    queryKey: ['endpoints'],
    queryFn: () => fetch(`${HOST}/?query=${ENDPOINT_LIST_QUERY}`).then(res => res.json()),
    retry: false,
    initialData: [],
  });

  const {isLoading: isGraphLoading, data: graphData} = useQuery({
    queryKey: ['graph'],
    queryFn: () =>
      fetch(`${HOST}/?query=${ENDPOINT_GRAPH_QUERY}`).then(res => res.json()),
    retry: false,
    initialData: [],
  });

  const quantiles = ['p50', 'p75', 'p95', 'p99'];

  const seriesByQuantile: {[quantile: string]: Series} = {};
  quantiles.forEach(quantile => {
    seriesByQuantile[quantile] = {
      seriesName: quantile,
      data: [],
    };
  });

  graphData.forEach(datum => {
    quantiles.forEach(quantile => {
      seriesByQuantile[quantile].data.push({
        value: datum[quantile],
        name: datum.interval,
      });
    });
  });

  const data = Object.values(seriesByQuantile);

  return (
    <Fragment>
      <Chart
        statsPeriod="24h"
        height={180}
        data={data}
        start=""
        end=""
        loading={isGraphLoading}
        utc={false}
        grid={{
          left: '0',
          right: '0',
          top: '16px',
          bottom: '8px',
        }}
        disableMultiAxis
        definedAxisTicks={4}
        stacked
      />

      <GridEditable
        isLoading={areEndpointsLoading}
        data={endpointsData}
        columnOrder={COLUMN_ORDER}
        columnSortBy={[]}
        grid={{
          renderHeadCell,
          renderBodyCell,
        }}
        location={location}
      />
    </Fragment>
  );
}

function renderHeadCell(column: GridColumnHeader): React.ReactNode {
  return <span>{column.name}</span>;
}

function renderBodyCell(column: GridColumnHeader, row: DataRow): React.ReactNode {
  return <span>{row[column.key]}</span>;
}
