"use client";

import {
  collection,
  doc,
  limit as qLimit,
  onSnapshot,
  orderBy,
  query,
  where,
  type QueryConstraint,
} from "firebase/firestore";
import { useEffect, useState } from "react";
import { clientDb } from "@/lib/firebase/client";

export interface LiveResult<T> {
  data: T;
  loading: boolean;
  error: string | null;
}

/** Live single document under users/{uid}/... (path segments after "users"). */
export function useLiveDoc<T>(segments: string[] | null): LiveResult<T | null> {
  const key = segments ? segments.join("/") : null;
  const [state, setState] = useState<LiveResult<T | null>>({ data: null, loading: Boolean(key), error: null });
  useEffect(() => {
    if (!key) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    setState((s) => ({ ...s, loading: true }));
    const [first, ...rest] = key.split("/");
    return onSnapshot(
      doc(clientDb(), first, ...rest),
      (snap) => setState({ data: snap.exists() ? (snap.data() as T) : null, loading: false, error: null }),
      (err) => setState({ data: null, loading: false, error: err.code ?? "read_failed" }),
    );
  }, [key]);
  return state;
}

export interface CollectionOptions {
  orderBy?: [string, "asc" | "desc"];
  limit?: number;
  where?: [string, "==" | ">=" | "<=" | ">" | "<" | "in", unknown];
}

/** Live collection query. */
export function useLiveCollection<T>(segments: string[] | null, opts: CollectionOptions = {}): LiveResult<T[]> {
  const key = segments ? `${segments.join("/")}|${JSON.stringify(opts)}` : null;
  const [state, setState] = useState<LiveResult<T[]>>({ data: [], loading: Boolean(key), error: null });
  useEffect(() => {
    if (!key) {
      setState({ data: [], loading: false, error: null });
      return;
    }
    const [path, optsJson] = key.split("|");
    const o = JSON.parse(optsJson) as CollectionOptions;
    const [first, ...rest] = path.split("/");
    const constraints: QueryConstraint[] = [];
    if (o.where) constraints.push(where(o.where[0], o.where[1], o.where[2]));
    if (o.orderBy) constraints.push(orderBy(o.orderBy[0], o.orderBy[1]));
    if (o.limit) constraints.push(qLimit(o.limit));
    setState((s) => ({ ...s, loading: true }));
    return onSnapshot(
      query(collection(clientDb(), first, ...rest), ...constraints),
      (snap) => setState({ data: snap.docs.map((d) => ({ id: d.id, ...d.data() }) as T), loading: false, error: null }),
      (err) => setState({ data: [], loading: false, error: err.code ?? "read_failed" }),
    );
  }, [key]);
  return state;
}
