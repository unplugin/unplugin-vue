<script lang="ts" setup>
const str = 'bar'

const {
  foo = '123',
  bar = 123,
  baz = true,
} = defineProps<{
  foo: string
  bar: number
  baz: boolean
}>()

defineExpose({
  str,
})
</script>

<template>
  <div>
    <h1>Hello World</h1>
  </div>
</template>
