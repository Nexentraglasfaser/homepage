import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
export default defineConfig({plugins:[react()],test:{testTimeout:30000,hookTimeout:60000,fileParallelism:false}});
