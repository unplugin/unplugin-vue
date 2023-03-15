<script setup lang="ts">
import { ref } from 'vue'
const msg = ref('')
</script>

<template>
  <div>
    <h1>Hello world</h1>
    <h2>{{ msg }}</h2>
    <input v-model="msg" type="text" />
  </div>
</template>

<style lang="scss">
body {
  background-color: aqua;

  h1 {
    background-color: yellow;
  }
}
</style>
