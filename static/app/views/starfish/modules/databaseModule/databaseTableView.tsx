import {CSSProperties, useState} from 'react';
import styled from '@emotion/styled';
import {Location} from 'history';

import Badge from 'sentry/components/badge';
import GridEditable, {GridColumnHeader} from 'sentry/components/gridEditable';
import {Hovercard} from 'sentry/components/hovercard';
import Link from 'sentry/components/links/link';
import {space} from 'sentry/styles/space';
import {SortableHeader} from 'sentry/views/starfish/modules/databaseModule/panel';

type Props = {
  isDataLoading: boolean;
  location: Location;
  onSelect: (row: DataRow, rowIndex: number) => void;
  columns?: any;
  data?: DataRow[];
  onSortChange?: ({
    direction,
    sortHeader,
  }: {
    direction: 'desc' | 'asc' | undefined;
    sortHeader: TableColumnHeader;
  }) => void;
  selectedRow?: DataRow;
};

export type DataRow = {
  action: string;
  count: number;
  data_keys: Array<string>;
  data_values: Array<string>;
  description: string;
  domain: string;
  epm: number;
  firstSeen: string;
  formatted_desc: string;
  group_id: string;
  lastSeen: string;
  newish: number;
  p75: number;
  retired: number;
  total_time: number;
  transactions: number;
};

type Keys = 'description' | 'domain' | 'epm' | 'p75' | 'transactions' | 'total_time';
export type TableColumnHeader = GridColumnHeader<Keys>;

const COLUMN_ORDER: TableColumnHeader[] = [
  {
    key: 'description',
    name: 'Query',
    width: 600,
  },
  {
    key: 'domain',
    name: 'Table',
    width: 200,
  },
  {
    key: 'epm',
    name: 'Tpm',
  },
  {
    key: 'p75',
    name: 'p75',
  },
  {
    key: 'transactions',
    name: 'transactions',
  },
  {
    key: 'total_time',
    name: 'Total Time',
  },
];

export default function APIModuleView({
  location,
  data,
  onSelect,
  onSortChange,
  selectedRow,
  isDataLoading,
  columns,
}: Props) {
  const [sort, setSort] = useState<{
    direction: 'desc' | 'asc' | undefined;
    sortHeader: TableColumnHeader | undefined;
  }>({direction: undefined, sortHeader: undefined});

  function onSortClick(col: TableColumnHeader) {
    let direction: 'desc' | 'asc' | undefined = undefined;
    if (sort.direction === 'desc') {
      direction = 'asc';
    } else if (!sort.direction) {
      direction = 'desc';
    }
    if (onSortChange) {
      setSort({direction, sortHeader: col});
      onSortChange({direction, sortHeader: col});
    }
  }

  function renderHeadCell(col: TableColumnHeader): React.ReactNode {
    const sortableKeys: Keys[] = ['p75', 'epm', 'total_time', 'domain', 'transactions'];
    if (sortableKeys.includes(col.key)) {
      const isBeingSorted = col.key === sort.sortHeader?.key;
      const direction = isBeingSorted ? sort.direction : undefined;
      return (
        <SortableHeader
          onClick={() => onSortClick(col)}
          direction={direction}
          title={col.name}
        />
      );
    }
    return <span>{col.name}</span>;
  }

  function renderBodyCell(
    column: TableColumnHeader,
    row: DataRow,
    rowIndex: number
  ): React.ReactNode {
    const {key} = column;

    const isSelectedRow = selectedRow?.group_id === row.group_id;
    const rowStyle: CSSProperties | undefined = isSelectedRow
      ? {fontWeight: 'bold'}
      : undefined;

    if (key === 'description') {
      const value = row[key];

      let headerExtra = '';
      if (row.newish === 1) {
        headerExtra = `Query (First seen ${row.firstSeen})`;
      } else if (row.retired === 1) {
        headerExtra = `Query (Last seen ${row.lastSeen})`;
      }
      return (
        <Hovercard header={headerExtra} body={value}>
          <Link onClick={() => onSelect(row, rowIndex)} to="" style={rowStyle}>
            {value.substring(0, 30)}
            {value.length > 30 ? '...' : ''}
            {value.length > 30 ? value.substring(value.length - 30) : ''}
          </Link>
          {row?.newish === 1 && <StyledBadge type="new" text="new" />}
          {row?.retired === 1 && <StyledBadge type="warning" text="old" />}
        </Hovercard>
      );
    }
    if (key === 'p75' || key === 'total_time') {
      const value = row[key];
      return <span style={rowStyle}>{value.toFixed(2)}ms</span>;
    }
    return <span style={rowStyle}>{row[key]}</span>;
  }

  return (
    <GridEditable
      isLoading={isDataLoading}
      data={data as any}
      columnOrder={columns ?? COLUMN_ORDER}
      columnSortBy={[]}
      grid={{
        renderHeadCell,
        renderBodyCell,
      }}
      location={location}
    />
  );
}

const StyledBadge = styled(Badge)`
  margin-left: ${space(0.75)};
`;
