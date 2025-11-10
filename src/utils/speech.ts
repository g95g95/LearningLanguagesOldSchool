import { useEffect, useState } from 'react';

export const useSpeechVoices = () => {
  const [voices, setVoices] = useState<SpeechSynthesisVoice[]>([]);

  useEffect(() => {
    if (typeof window === 'undefined' || !('speechSynthesis' in window)) {
      return;
    }

    const synth = window.speechSynthesis;
    const populateVoices = () => {
      setVoices(synth.getVoices());
    };

    populateVoices();

    if (typeof synth.addEventListener === 'function' && typeof synth.removeEventListener === 'function') {
      synth.addEventListener('voiceschanged', populateVoices);

      return () => {
        synth.removeEventListener('voiceschanged', populateVoices);
      };
    }

    if ('onvoiceschanged' in synth) {
      const speech = synth as SpeechSynthesis & {
        onvoiceschanged: ((this: SpeechSynthesis, ev: Event) => unknown) | null;
      };
      const handler = () => populateVoices();
      speech.onvoiceschanged = handler;

      return () => {
        if (speech.onvoiceschanged === handler) {
          speech.onvoiceschanged = null;
        }
      };
    }

    return undefined;
  }, []);

  return voices;
};
