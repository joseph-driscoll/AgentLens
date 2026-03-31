import { createContext, useContext, useState, useCallback, type ReactNode } from 'react';

export interface LangSmithConfig {
  apiKey: string;
  projectId: string;
  projectName: string;
}

interface LangSmithState {
  config: LangSmithConfig | null;
  isConnected: boolean;
  openAiKey: string;
  setConfig: (config: LangSmithConfig) => void;
  clearConfig: () => void;
  setOpenAiKey: (key: string) => void;
}

const STORAGE_KEY = 'agentlens_langsmith_config';
const OAI_KEY = 'agentlens_openai_key';

const LangSmithContext = createContext<LangSmithState | null>(null);

export function LangSmithProvider({ children }: { children: ReactNode }) {
  const [config, setConfigState] = useState<LangSmithConfig | null>(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY);
      return stored ? (JSON.parse(stored) as LangSmithConfig) : null;
    } catch {
      return null;
    }
  });

  const [openAiKey, setOpenAiKeyState] = useState<string>(
    () => localStorage.getItem(OAI_KEY) ?? '',
  );

  const setConfig = useCallback((cfg: LangSmithConfig) => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(cfg));
    setConfigState(cfg);
  }, []);

  const clearConfig = useCallback(() => {
    localStorage.removeItem(STORAGE_KEY);
    setConfigState(null);
  }, []);

  const setOpenAiKey = useCallback((key: string) => {
    localStorage.setItem(OAI_KEY, key);
    setOpenAiKeyState(key);
  }, []);

  return (
    <LangSmithContext
      value={{ config, isConnected: !!config?.apiKey, openAiKey, setConfig, clearConfig, setOpenAiKey }}
    >
      {children}
    </LangSmithContext>
  );
}

export function useLangSmith(): LangSmithState {
  const ctx = useContext(LangSmithContext);
  if (!ctx) throw new Error('useLangSmith must be used within LangSmithProvider');
  return ctx;
}
