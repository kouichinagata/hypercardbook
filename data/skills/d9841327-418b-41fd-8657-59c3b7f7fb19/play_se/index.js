export default function(context, seId) {
    if (typeof window === 'undefined') return;
    const AudioContext = window.AudioContext || window.webkitAudioContext;
    if (!AudioContext) return;
    
    // Create audio context on interaction if suspended
    const ctx = new AudioContext();
    if (ctx.state === 'suspended') {
        ctx.resume();
    }

    const time = ctx.currentTime;

    if (seId && seId.startsWith('footsteps')) {
        // Footsteps: a deep thumping low frequency sound with a bit of noise
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filter = ctx.createBiquadFilter();
        
        osc.connect(filter);
        filter.connect(gain);
        gain.connect(ctx.destination);

        // Footstep pitch setup
        osc.type = 'sine';
        osc.frequency.setValueAtTime(75, time);
        osc.frequency.exponentialRampToValueAtTime(15, time + 0.15);

        // Lowpass to make it sound muffled/heavy
        filter.type = 'lowpass';
        filter.frequency.setValueAtTime(100, time);

        // Gain envelope
        const volume = seId.includes('far') ? 0.15 : (seId.includes('mid') ? 0.35 : 0.6);
        gain.gain.setValueAtTime(volume, time);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.16);

        osc.start(time);
        osc.stop(time + 0.18);

        // If it's a dragging footstep, add a scraping friction noise block
        if (seId.includes('drag')) {
            const dragDuration = 0.4;
            const bufferSize = ctx.sampleRate * dragDuration;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            
            // Generate low-passed white noise
            let lastOut = 0.0;
            for (let i = 0; i < bufferSize; i++) {
                const white = Math.random() * 2 - 1;
                data[i] = 0.05 * lastOut + 0.95 * white;
                lastOut = data[i];
            }
            
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            
            const noiseFilter = ctx.createBiquadFilter();
            noiseFilter.type = 'bandpass';
            noiseFilter.frequency.setValueAtTime(150, time);
            noiseFilter.Q.value = 1.0;
            
            const noiseGain = ctx.createGain();
            noise.connect(noiseFilter);
            noiseFilter.connect(noiseGain);
            noiseGain.connect(ctx.destination);
            
            const noiseVolume = seId.includes('far') ? 0.04 : 0.15;
            noiseGain.gain.setValueAtTime(0.001, time);
            noiseGain.gain.linearRampToValueAtTime(noiseVolume, time + 0.05);
            noiseGain.gain.exponentialRampToValueAtTime(0.001, time + dragDuration);
            
            noise.start(time);
            noise.stop(time + dragDuration);
        }
    } else if (seId === 'heartbeat') {
        // Heartbeat: double thump "lub-dub" sound using sine wave
        const playThump = (startTime, vol) => {
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            
            osc.connect(gain);
            gain.connect(ctx.destination);
            
            osc.frequency.setValueAtTime(55, startTime);
            osc.frequency.exponentialRampToValueAtTime(5, startTime + 0.12);
            
            gain.gain.setValueAtTime(vol, startTime);
            gain.gain.exponentialRampToValueAtTime(0.001, startTime + 0.13);
            
            osc.start(startTime);
            osc.stop(startTime + 0.15);
        };
        
        playThump(time, 0.55);
        playThump(time + 0.22, 0.4);
    } else if (seId === 'door_rattle') {
        // Door rattle: jittery high frequency metal shaking sounds using rapid white noise pulses
        const pulses = 5;
        for (let i = 0; i < pulses; i++) {
            const pulseTime = time + i * 0.06;
            const dur = 0.04;
            const bufferSize = ctx.sampleRate * dur;
            const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
            const data = buffer.getChannelData(0);
            for (let j = 0; j < bufferSize; j++) {
                data[j] = Math.random() * 2 - 1;
            }
            
            const noise = ctx.createBufferSource();
            noise.buffer = buffer;
            
            const filterNode = ctx.createBiquadFilter();
            filterNode.type = 'bandpass';
            filterNode.frequency.setValueAtTime(1000 + Math.random() * 800, pulseTime);
            filterNode.Q.value = 5.0;
            
            const pulseGain = ctx.createGain();
            noise.connect(filterNode);
            filterNode.connect(pulseGain);
            pulseGain.connect(ctx.destination);
            
            pulseGain.gain.setValueAtTime(0.12, pulseTime);
            pulseGain.gain.exponentialRampToValueAtTime(0.001, pulseTime + dur);
            
            noise.start(pulseTime);
            noise.stop(pulseTime + dur);
        }
    } else if (seId === 'ambient_cold' || seId === 'wind_blow') {
        // Ambient cold / wind: sweeping thin bandpass white noise to emulate cold draft
        const dur = 2.2;
        const bufferSize = ctx.sampleRate * dur;
        const buffer = ctx.createBuffer(1, bufferSize, ctx.sampleRate);
        const data = buffer.getChannelData(0);
        
        let lastOut = 0.0;
        for (let i = 0; i < bufferSize; i++) {
            const white = Math.random() * 2 - 1;
            data[i] = 0.05 * lastOut + 0.95 * white;
            lastOut = data[i];
        }
        
        const noise = ctx.createBufferSource();
        noise.buffer = buffer;
        
        const filterNode = ctx.createBiquadFilter();
        filterNode.type = 'bandpass';
        filterNode.frequency.setValueAtTime(380, time);
        filterNode.frequency.linearRampToValueAtTime(750, time + dur);
        filterNode.Q.value = 2.5;
        
        const windGain = ctx.createGain();
        noise.connect(filterNode);
        filterNode.connect(windGain);
        windGain.connect(ctx.destination);
        
        windGain.gain.setValueAtTime(0.001, time);
        windGain.gain.linearRampToValueAtTime(0.2, time + 0.5);
        windGain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        
        noise.start(time);
        noise.stop(time + dur);
    } else if (seId === 'closet_open') {
        // Closet open: low frequency squeak/groan
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        const filterNode = ctx.createBiquadFilter();
        
        osc.connect(filterNode);
        filterNode.connect(gain);
        gain.connect(ctx.destination);
        
        osc.type = 'triangle';
        osc.frequency.setValueAtTime(90, time);
        osc.frequency.linearRampToValueAtTime(160, time + 0.8);
        
        filterNode.type = 'lowpass';
        filterNode.frequency.setValueAtTime(180, time);
        
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.12, time + 0.15);
        gain.gain.exponentialRampToValueAtTime(0.001, time + 0.9);
        
        osc.start(time);
        osc.stop(time + 0.95);
    } else if (seId === 'horror_whisper') {
        // horror_whisper: "mitsuketa" - synthesized creepy robotic/spectral metallic chime
        const dur = 1.0;
        const osc1 = ctx.createOscillator();
        const osc2 = ctx.createOscillator();
        const gain = ctx.createGain();
        
        osc1.connect(gain);
        osc2.connect(gain);
        gain.connect(ctx.destination);
        
        osc1.type = 'sine';
        osc1.frequency.setValueAtTime(140, time);
        osc1.frequency.linearRampToValueAtTime(80, time + dur);
        
        osc2.type = 'sawtooth';
        osc2.frequency.setValueAtTime(145, time);
        osc2.frequency.linearRampToValueAtTime(82, time + dur);
        
        // Ring modulation like distortion via bandpass
        const bp = ctx.createBiquadFilter();
        bp.type = 'bandpass';
        bp.frequency.setValueAtTime(500, time);
        bp.Q.value = 1.5;
        
        gain.disconnect(ctx.destination);
        gain.connect(bp);
        bp.connect(ctx.destination);
        
        gain.gain.setValueAtTime(0.001, time);
        gain.gain.linearRampToValueAtTime(0.08, time + 0.1);
        gain.gain.exponentialRampToValueAtTime(0.001, time + dur);
        
        osc1.start(time);
        osc1.stop(time + dur);
        osc2.start(time);
        osc2.stop(time + dur);
    }
}
